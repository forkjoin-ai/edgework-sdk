/**
 * Model Sync Service
 *
 * Downloads model weights progressively from a sync server,
 * with resume support and verification.
 */

import type { BaseStorage } from '../storage/base-storage';
import type {
  DownloadProgress,
  ModelMeta,
  TensorChunk,
  TokenizerData,
  SyncProgress,
} from '../../types';

export interface ModelManifest {
  model: ModelMeta;
  tokenizer: {
    vocabUrl: string;
    mergesUrl?: string;
    specialTokens: Record<string, number>;
    chatTemplate?: string;
  };
  layers: Array<{
    layerIndex: number;
    tensors: Array<{
      name: string;
      dtype: string;
      shape: number[];
      chunks: Array<{
        index: number;
        url: string;
        size: number;
        hash: string;
      }>;
    }>;
  }>;
  totalSize: number;
}

export class ModelSync {
  private storage: BaseStorage;
  private syncUrl: string;
  private onProgress?: (progress: DownloadProgress) => void;
  private abortController: AbortController | null = null;
  private currentProgress: DownloadProgress | null = null;
  private isPaused = false;

  constructor(
    storage: BaseStorage,
    syncUrl: string,
    onProgress?: (progress: DownloadProgress) => void
  ) {
    this.storage = storage;
    this.syncUrl = syncUrl.replace(/\/$/, '');
    this.onProgress = onProgress;
  }

  /**
   * Start or resume syncing a model
   */
  async startSync(modelId: string): Promise<void> {
    this.abortController = new AbortController();
    this.isPaused = false;

    try {
      // Fetch model manifest
      const manifest = await this.fetchManifest(modelId);

      // Save model metadata
      await this.storage.setModelMeta(manifest.model);

      // Download tokenizer
      await this.downloadTokenizer(modelId, manifest.tokenizer);

      // Initialize progress tracking
      const existingProgress = await this.storage.getSyncProgress(modelId);
      const progressMap = new Map<string, SyncProgress>();
      for (const p of existingProgress) {
        progressMap.set(p.tensorName, p);
      }

      // Calculate total chunks
      let totalChunks = 0;
      let downloadedChunks = 0;
      for (const layer of manifest.layers) {
        for (const tensor of layer.tensors) {
          totalChunks += tensor.chunks.length;
          const existing = progressMap.get(tensor.name);
          if (existing) {
            downloadedChunks += existing.chunksDownloaded;
          }
        }
      }

      // Update progress
      this.currentProgress = {
        modelId,
        percent: (downloadedChunks / totalChunks) * 100,
        bytesDownloaded: 0,
        totalBytes: manifest.totalSize,
        layersComplete: 0,
        totalLayers: manifest.layers.length,
        status: 'downloading',
      };
      this.emitProgress();

      // Download layers progressively
      for (let i = 0; i < manifest.layers.length; i++) {
        const layer = manifest.layers[i];

        // Check for abort/pause
        if (this.abortController.signal.aborted) break;
        while (this.isPaused) {
          await new Promise((r) => setTimeout(r, 100));
          if (this.abortController.signal.aborted) break;
        }

        this.currentProgress.currentLayer = `Layer ${layer.layerIndex}`;
        this.emitProgress();

        // Download each tensor in the layer
        for (const tensor of layer.tensors) {
          await this.downloadTensor(
            modelId,
            layer.layerIndex,
            tensor,
            progressMap
          );
        }

        this.currentProgress.layersComplete = i + 1;
        this.emitProgress();
      }

      // Verify and mark complete
      this.currentProgress.status = 'verifying';
      this.emitProgress();

      const isComplete = await this.storage.isModelComplete(modelId);
      if (isComplete) {
        this.currentProgress.status = 'ready';
        this.currentProgress.percent = 100;
      } else {
        this.currentProgress.status = 'error';
        this.currentProgress.error = 'Download incomplete';
      }
      this.emitProgress();
    } catch (error) {
      if (this.currentProgress) {
        this.currentProgress.status = 'error';
        this.currentProgress.error =
          error instanceof Error ? error.message : 'Unknown error';
        this.emitProgress();
      }
      throw error;
    }
  }

  /**
   * Pause the current sync
   */
  async pauseSync(): Promise<void> {
    this.isPaused = true;
  }

  /**
   * Resume the current sync
   */
  async resumeSync(): Promise<void> {
    this.isPaused = false;
  }

  /**
   * Cancel the current sync
   */
  async cancelSync(): Promise<void> {
    this.abortController?.abort();
    this.isPaused = false;
    this.currentProgress = null;
  }

  /**
   * Get current progress
   */
  getProgress(): DownloadProgress | null {
    return this.currentProgress;
  }

  /**
   * Check if syncing
   */
  isSyncing(): boolean {
    return (
      this.currentProgress !== null &&
      this.currentProgress.status === 'downloading'
    );
  }

  /**
   * Fetch model manifest from sync server
   */
  private async fetchManifest(modelId: string): Promise<ModelManifest> {
    const response = await fetch(
      `${this.syncUrl}/models/${modelId}/manifest.json`,
      { signal: this.abortController?.signal }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Download tokenizer files
   */
  private async downloadTokenizer(
    modelId: string,
    tokenizerInfo: ModelManifest['tokenizer']
  ): Promise<void> {
    // Check if already downloaded
    const existing = await this.storage.getTokenizer(modelId);
    if (existing) return;

    // Download vocab
    const vocabResponse = await fetch(tokenizerInfo.vocabUrl, {
      signal: this.abortController?.signal,
    });
    if (!vocabResponse.ok) {
      throw new Error(`Failed to download vocab: ${vocabResponse.statusText}`);
    }
    const vocab = await vocabResponse.arrayBuffer();

    // Download merges if present
    let merges: ArrayBuffer | undefined;
    if (tokenizerInfo.mergesUrl) {
      const mergesResponse = await fetch(tokenizerInfo.mergesUrl, {
        signal: this.abortController?.signal,
      });
      if (mergesResponse.ok) {
        merges = await mergesResponse.arrayBuffer();
      }
    }

    // Save tokenizer
    const tokenizerData: TokenizerData = {
      modelId,
      vocab,
      merges,
      specialTokens: tokenizerInfo.specialTokens,
      chatTemplate: tokenizerInfo.chatTemplate,
    };
    await this.storage.setTokenizer(tokenizerData);
  }

  /**
   * Download a tensor's chunks
   */
  private async downloadTensor(
    modelId: string,
    layerIndex: number,
    tensor: ModelManifest['layers'][0]['tensors'][0],
    progressMap: Map<string, SyncProgress>
  ): Promise<void> {
    const existing = progressMap.get(tensor.name);
    const startChunk = existing?.chunksDownloaded ?? 0;

    for (let i = startChunk; i < tensor.chunks.length; i++) {
      // Check for abort
      if (this.abortController?.signal.aborted) return;
      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 100));
        if (this.abortController?.signal.aborted) return;
      }

      const chunk = tensor.chunks[i];

      // Download chunk
      const response = await fetch(chunk.url, {
        signal: this.abortController?.signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to download chunk: ${response.statusText}`);
      }

      const data = await response.arrayBuffer();

      // Verify hash
      const hash = await this.computeHash(data);
      if (hash !== chunk.hash) {
        throw new Error(`Hash mismatch for ${tensor.name} chunk ${i}`);
      }

      // Store chunk
      const tensorChunk: TensorChunk = {
        id: `${modelId}:${tensor.name}:${i}`,
        modelId,
        tensorName: tensor.name,
        layerIndex,
        chunkIndex: i,
        totalChunks: tensor.chunks.length,
        dtype: tensor.dtype as any,
        shape: tensor.shape,
        offset: i * data.byteLength,
        data,
        hash,
      };
      await this.storage.storeTensorChunk(tensorChunk);

      // Update progress
      const progress: SyncProgress = {
        modelId,
        tensorName: tensor.name,
        chunksDownloaded: i + 1,
        totalChunks: tensor.chunks.length,
        lastSync: new Date().toISOString(),
      };
      await this.storage.updateSyncProgress(progress);
      progressMap.set(tensor.name, progress);

      // Update download progress
      if (this.currentProgress) {
        this.currentProgress.bytesDownloaded += data.byteLength;
        this.currentProgress.percent =
          (this.currentProgress.bytesDownloaded /
            this.currentProgress.totalBytes) *
          100;
        this.emitProgress();
      }
    }
  }

  /**
   * Compute SHA-256 hash of data
   */
  private async computeHash(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Emit progress update
   */
  private emitProgress(): void {
    if (this.onProgress && this.currentProgress) {
      this.onProgress({ ...this.currentProgress });
    }
  }
}
