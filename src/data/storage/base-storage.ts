/**
 * Base Storage Class
 *
 * Abstract implementation of ModelStorage interface.
 */

import type {
  ModelMeta,
  TensorChunk,
  TokenizerData,
  SyncProgress,
  UserAdapter,
  TrainingLogEntry,
  StorageBackend,
} from '../../types';

export abstract class BaseStorage {
  abstract readonly backend: StorageBackend;

  // Initialization
  abstract initialize(): Promise<void>;

  // Model metadata
  abstract getModelMeta(modelId: string): Promise<ModelMeta | null>;
  abstract setModelMeta(meta: ModelMeta): Promise<void>;
  abstract deleteModelMeta(modelId: string): Promise<void>;
  abstract listModels(): Promise<ModelMeta[]>;

  // Tensor chunks
  abstract getTensorChunks(
    modelId: string,
    layerIndex: number
  ): Promise<TensorChunk[]>;
  abstract getTensorChunk(
    modelId: string,
    tensorName: string,
    chunkIndex: number
  ): Promise<TensorChunk | null>;
  abstract storeTensorChunk(chunk: TensorChunk): Promise<void>;
  abstract deleteTensorChunks(modelId: string): Promise<void>;

  // Tokenizer
  abstract getTokenizer(modelId: string): Promise<TokenizerData | null>;
  abstract setTokenizer(data: TokenizerData): Promise<void>;

  // Sync progress
  abstract getSyncProgress(modelId: string): Promise<SyncProgress[]>;
  abstract updateSyncProgress(progress: SyncProgress): Promise<void>;
  abstract clearSyncProgress(modelId: string): Promise<void>;

  // User adapters (for RLHF)
  abstract getUserAdapter(
    modelId: string,
    userId: string
  ): Promise<UserAdapter | null>;
  abstract setUserAdapter(adapter: UserAdapter): Promise<void>;
  abstract deleteUserAdapter(adapterId: string): Promise<void>;

  // Training log
  abstract addTrainingLogEntry(
    entry: Omit<TrainingLogEntry, 'id'>
  ): Promise<number>;
  abstract getTrainingLog(
    adapterId: string,
    limit?: number
  ): Promise<TrainingLogEntry[]>;

  // Utility methods
  abstract isModelComplete(modelId: string): Promise<boolean>;
  abstract getStorageUsed(): Promise<number>;
  abstract clear(): Promise<void>;

  /**
   * Load all tensor chunks for a layer and combine into Float32Arrays
   */
  async loadLayerWeights(
    modelId: string,
    layerIndex: number
  ): Promise<Map<string, Float32Array>> {
    const chunks = await this.getTensorChunks(modelId, layerIndex);
    const tensors = new Map<string, ArrayBuffer[]>();

    // Group chunks by tensor name
    for (const chunk of chunks) {
      if (!tensors.has(chunk.tensorName)) {
        tensors.set(chunk.tensorName, []);
      }
      tensors.get(chunk.tensorName)![chunk.chunkIndex] = chunk.data;
    }

    // Combine chunks into Float32Arrays
    const result = new Map<string, Float32Array>();
    for (const [name, chunks] of tensors) {
      const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
      const combined = new Float32Array(totalSize / 4);
      let offset = 0;
      for (const chunk of chunks) {
        const f32 = new Float32Array(chunk);
        combined.set(f32, offset);
        offset += f32.length;
      }
      result.set(name, combined);
    }

    return result;
  }

  /**
   * Get download progress percentage
   */
  async getDownloadProgress(modelId: string): Promise<number> {
    const progress = await this.getSyncProgress(modelId);
    if (progress.length === 0) return 0;

    const downloaded = progress.reduce((sum, p) => sum + p.chunksDownloaded, 0);
    const total = progress.reduce((sum, p) => sum + p.totalChunks, 0);

    return total > 0 ? (downloaded / total) * 100 : 0;
  }
}
