/**
 * OPFS Storage Implementation
 *
 * Uses Origin Private File System for model weight storage.
 * Provides best performance for large binary data in browsers.
 */

import { BaseStorage } from './base-storage';
import type { DownloadProgress } from '../../types';
import type {
  ModelMeta,
  TensorChunk,
  TokenizerData,
  SyncProgress,
  UserAdapter,
  TrainingLogEntry,
  StorageBackend,
} from '../../schemas';

const DB_NAME = 'edgework-models';
const DB_VERSION = 1;

interface OPFSDatabase {
  models: ModelMeta[];
  tokenizers: Map<string, TokenizerData>;
  syncProgress: Map<string, SyncProgress[]>;
  adapters: Map<string, UserAdapter>;
  trainingLog: TrainingLogEntry[];
}

export class OPFSStorage extends BaseStorage {
  readonly backend: StorageBackend = 'opfs';
  private root: FileSystemDirectoryHandle | null = null;
  private metaDb: OPFSDatabase | null = null;
  private metaFile: FileSystemFileHandle | null = null;

  /**
   * Initialize OPFS storage
   */
  async initialize(): Promise<void> {
    if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
      throw new Error('OPFS is not supported in this browser');
    }

    this.root = await navigator.storage.getDirectory();
    const modelsDir = await this.root.getDirectoryHandle('models', {
      create: true,
    });

    // Load or create metadata file
    this.metaFile = await modelsDir.getFileHandle('meta.json', {
      create: true,
    });
    await this.loadMetadata();
  }

  private async loadMetadata(): Promise<void> {
    if (!this.metaFile) return;

    try {
      const file = await this.metaFile.getFile();
      const text = await file.text();
      if (text) {
        const data = JSON.parse(text);
        this.metaDb = {
          models: data.models || [],
          tokenizers: new Map(Object.entries(data.tokenizers || {})),
          syncProgress: new Map(Object.entries(data.syncProgress || {})),
          adapters: new Map(Object.entries(data.adapters || {})),
          trainingLog: data.trainingLog || [],
        };
      } else {
        this.metaDb = {
          models: [],
          tokenizers: new Map(),
          syncProgress: new Map(),
          adapters: new Map(),
          trainingLog: [],
        };
      }
    } catch {
      this.metaDb = {
        models: [],
        tokenizers: new Map(),
        syncProgress: new Map(),
        adapters: new Map(),
        trainingLog: [],
      };
    }
  }

  private async saveMetadata(): Promise<void> {
    if (!this.metaFile || !this.metaDb) return;

    const data = {
      models: this.metaDb.models,
      tokenizers: Object.fromEntries(this.metaDb.tokenizers),
      syncProgress: Object.fromEntries(this.metaDb.syncProgress),
      adapters: Object.fromEntries(this.metaDb.adapters),
      trainingLog: this.metaDb.trainingLog,
    };

    const writable = await this.metaFile.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
  }

  private async getModelDir(
    modelId: string
  ): Promise<FileSystemDirectoryHandle> {
    if (!this.root) throw new Error('Storage not initialized');
    const modelsDir = await this.root.getDirectoryHandle('models', {
      create: true,
    });
    return modelsDir.getDirectoryHandle(modelId, { create: true });
  }

  // Model metadata
  async getModelMeta(modelId: string): Promise<ModelMeta | null> {
    if (!this.metaDb) return null;
    return this.metaDb.models.find((m) => m.id === modelId) || null;
  }

  async setModelMeta(meta: ModelMeta): Promise<void> {
    if (!this.metaDb) return;
    const idx = this.metaDb.models.findIndex((m) => m.id === meta.id);
    if (idx >= 0) {
      this.metaDb.models[idx] = meta;
    } else {
      this.metaDb.models.push(meta);
    }
    await this.saveMetadata();
  }

  async deleteModelMeta(modelId: string): Promise<void> {
    if (!this.metaDb) return;
    this.metaDb.models = this.metaDb.models.filter((m) => m.id !== modelId);
    await this.saveMetadata();
  }

  async listModels(): Promise<ModelMeta[]> {
    return this.metaDb?.models || [];
  }

  // Tensor chunks - stored as binary files in OPFS
  async getTensorChunks(
    modelId: string,
    layerIndex: number
  ): Promise<TensorChunk[]> {
    const chunks: TensorChunk[] = [];
    try {
      const modelDir = await this.getModelDir(modelId);
      const layerDir = await modelDir.getDirectoryHandle(
        `layer_${layerIndex}`,
        {
          create: false,
        }
      );

      // Use values() iterator for better compatibility
      const entries = (layerDir as any).entries() as AsyncIterable<
        [string, FileSystemHandle]
      >;
      for await (const [name, handle] of entries) {
        if (handle.kind === 'file' && name.endsWith('.bin')) {
          const file = await (handle as FileSystemFileHandle).getFile();
          const metaName = name.replace('.bin', '.json');
          const metaHandle = await layerDir.getFileHandle(metaName);
          const metaFile = await metaHandle.getFile();
          const meta = JSON.parse(await metaFile.text());

          chunks.push({
            ...meta,
            data: await file.arrayBuffer(),
          });
        }
      }
    } catch {
      // Directory doesn't exist, return empty
    }
    return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getTensorChunk(
    modelId: string,
    tensorName: string,
    chunkIndex: number
  ): Promise<TensorChunk | null> {
    // Parse layer index from tensor name
    const match = tensorName.match(/blk\.(\d+)/);
    if (!match) return null;
    const layerIndex = parseInt(match[1], 10);

    const chunks = await this.getTensorChunks(modelId, layerIndex);
    return (
      chunks.find(
        (c) => c.tensorName === tensorName && c.chunkIndex === chunkIndex
      ) || null
    );
  }

  async storeTensorChunk(chunk: TensorChunk): Promise<void> {
    const modelDir = await this.getModelDir(chunk.modelId);
    const layerDir = await modelDir.getDirectoryHandle(
      `layer_${chunk.layerIndex ?? 'embed'}`,
      { create: true }
    );

    // Store binary data
    const binName = `${chunk.tensorName}_${chunk.chunkIndex}.bin`;
    const binHandle = await layerDir.getFileHandle(binName, { create: true });
    const binWritable = await binHandle.createWritable();
    await binWritable.write(chunk.data);
    await binWritable.close();

    // Store metadata
    const metaName = `${chunk.tensorName}_${chunk.chunkIndex}.json`;
    const metaHandle = await layerDir.getFileHandle(metaName, { create: true });
    const metaWritable = await metaHandle.createWritable();
    const { data: _, ...meta } = chunk;
    await metaWritable.write(JSON.stringify(meta));
    await metaWritable.close();
  }

  async deleteTensorChunks(modelId: string): Promise<void> {
    if (!this.root) return;
    try {
      const modelsDir = await this.root.getDirectoryHandle('models');
      await modelsDir.removeEntry(modelId, { recursive: true });
    } catch {
      // Directory doesn't exist
    }
  }

  // Tokenizer
  async getTokenizer(modelId: string): Promise<TokenizerData | null> {
    return this.metaDb?.tokenizers.get(modelId) || null;
  }

  async setTokenizer(data: TokenizerData): Promise<void> {
    if (!this.metaDb) return;
    this.metaDb.tokenizers.set(data.modelId, data);
    await this.saveMetadata();
  }

  // Sync progress
  async getSyncProgress(modelId: string): Promise<SyncProgress[]> {
    return this.metaDb?.syncProgress.get(modelId) || [];
  }

  async updateSyncProgress(progress: SyncProgress): Promise<void> {
    if (!this.metaDb) return;
    const existing = this.metaDb.syncProgress.get(progress.modelId) || [];
    const idx = existing.findIndex((p) => p.tensorName === progress.tensorName);
    if (idx >= 0) {
      existing[idx] = progress;
    } else {
      existing.push(progress);
    }
    this.metaDb.syncProgress.set(progress.modelId, existing);
    await this.saveMetadata();
  }

  async clearSyncProgress(modelId: string): Promise<void> {
    if (!this.metaDb) return;
    this.metaDb.syncProgress.delete(modelId);
    await this.saveMetadata();
  }

  // User adapters
  async getUserAdapter(
    modelId: string,
    userId: string
  ): Promise<UserAdapter | null> {
    if (!this.metaDb) return null;
    for (const adapter of this.metaDb.adapters.values()) {
      if (adapter.modelId === modelId && adapter.userId === userId) {
        return adapter;
      }
    }
    return null;
  }

  async setUserAdapter(adapter: UserAdapter): Promise<void> {
    if (!this.metaDb) return;
    this.metaDb.adapters.set(adapter.id, adapter);
    await this.saveMetadata();
  }

  async deleteUserAdapter(adapterId: string): Promise<void> {
    if (!this.metaDb) return;
    this.metaDb.adapters.delete(adapterId);
    await this.saveMetadata();
  }

  // Training log
  async addTrainingLogEntry(
    entry: Omit<TrainingLogEntry, 'id'>
  ): Promise<number> {
    if (!this.metaDb) return -1;
    const id = this.metaDb.trainingLog.length;
    this.metaDb.trainingLog.push({ ...entry, id });
    await this.saveMetadata();
    return id;
  }

  async getTrainingLog(
    adapterId: string,
    limit = 100
  ): Promise<TrainingLogEntry[]> {
    if (!this.metaDb) return [];
    return this.metaDb.trainingLog
      .filter((e) => e.adapterId === adapterId)
      .slice(-limit);
  }

  // Utility
  async isModelComplete(modelId: string): Promise<boolean> {
    const progress = await this.getSyncProgress(modelId);
    if (progress.length === 0) return false;
    return progress.every((p) => p.chunksDownloaded >= p.totalChunks);
  }

  async getStorageUsed(): Promise<number> {
    if (!navigator.storage.estimate) return 0;
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }

  async clear(): Promise<void> {
    if (!this.root) return;
    try {
      await this.root.removeEntry('models', { recursive: true });
    } catch {
      // Directory doesn't exist
    }
    this.metaDb = {
      models: [],
      tokenizers: new Map(),
      syncProgress: new Map(),
      adapters: new Map(),
      trainingLog: [],
    };
  }
}
