/**
 * Memory Storage Implementation
 *
 * In-memory storage for testing and Node.js environments.
 * Does not persist data between sessions.
 */

import { BaseStorage } from './base-storage';
import type {
  ModelMeta,
  TensorChunk,
  TokenizerData,
  SyncProgress,
  UserAdapter,
  TrainingLogEntry,
  StorageBackend,
} from '../../types';

export class MemoryStorage extends BaseStorage {
  readonly backend: StorageBackend = 'memory';

  private models = new Map<string, ModelMeta>();
  private tensorChunks = new Map<string, TensorChunk>();
  private tokenizers = new Map<string, TokenizerData>();
  private syncProgress = new Map<string, SyncProgress[]>();
  private userAdapters = new Map<string, UserAdapter>();
  private trainingLog: TrainingLogEntry[] = [];
  private nextLogId = 0;

  async initialize(): Promise<void> {
    /* noop - nothing to initialize for memory storage */
  }

  // Model metadata
  async getModelMeta(modelId: string): Promise<ModelMeta | null> {
    return this.models.get(modelId) || null;
  }

  async setModelMeta(meta: ModelMeta): Promise<void> {
    this.models.set(meta.id, meta);
  }

  async deleteModelMeta(modelId: string): Promise<void> {
    this.models.delete(modelId);
  }

  async listModels(): Promise<ModelMeta[]> {
    return Array.from(this.models.values());
  }

  // Tensor chunks
  async getTensorChunks(
    modelId: string,
    layerIndex: number
  ): Promise<TensorChunk[]> {
    const chunks: TensorChunk[] = [];
    for (const chunk of this.tensorChunks.values()) {
      if (chunk.modelId === modelId && chunk.layerIndex === layerIndex) {
        chunks.push(chunk);
      }
    }
    return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getTensorChunk(
    modelId: string,
    tensorName: string,
    chunkIndex: number
  ): Promise<TensorChunk | null> {
    const id = `${modelId}:${tensorName}:${chunkIndex}`;
    return this.tensorChunks.get(id) || null;
  }

  async storeTensorChunk(chunk: TensorChunk): Promise<void> {
    this.tensorChunks.set(chunk.id, chunk);
  }

  async deleteTensorChunks(modelId: string): Promise<void> {
    for (const [key, chunk] of this.tensorChunks) {
      if (chunk.modelId === modelId) {
        this.tensorChunks.delete(key);
      }
    }
  }

  // Tokenizer
  async getTokenizer(modelId: string): Promise<TokenizerData | null> {
    return this.tokenizers.get(modelId) || null;
  }

  async setTokenizer(data: TokenizerData): Promise<void> {
    this.tokenizers.set(data.modelId, data);
  }

  // Sync progress
  async getSyncProgress(modelId: string): Promise<SyncProgress[]> {
    return this.syncProgress.get(modelId) || [];
  }

  async updateSyncProgress(progress: SyncProgress): Promise<void> {
    const existing = this.syncProgress.get(progress.modelId) || [];
    const idx = existing.findIndex((p) => p.tensorName === progress.tensorName);
    if (idx >= 0) {
      existing[idx] = progress;
    } else {
      existing.push(progress);
    }
    this.syncProgress.set(progress.modelId, existing);
  }

  async clearSyncProgress(modelId: string): Promise<void> {
    this.syncProgress.delete(modelId);
  }

  // User adapters
  async getUserAdapter(
    modelId: string,
    userId: string,
    adapterId?: string
  ): Promise<UserAdapter | null> {
    for (const adapter of this.userAdapters.values()) {
      if (
        adapter.modelId === modelId &&
        adapter.userId === userId &&
        (!adapterId || adapter.id === adapterId)
      ) {
        return adapter;
      }
    }
    return null;
  }

  async setUserAdapter(adapter: UserAdapter): Promise<void> {
    this.userAdapters.set(adapter.id, adapter);
  }

  async deleteUserAdapter(adapterId: string): Promise<void> {
    this.userAdapters.delete(adapterId);
  }

  // Training log
  async addTrainingLogEntry(
    entry: Omit<TrainingLogEntry, 'id'>
  ): Promise<number> {
    const id = this.nextLogId++;
    this.trainingLog.push({ ...entry, id });
    return id;
  }

  async getTrainingLog(
    adapterId: string,
    limit = 100
  ): Promise<TrainingLogEntry[]> {
    return this.trainingLog
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
    let size = 0;
    for (const chunk of this.tensorChunks.values()) {
      size += chunk.data.byteLength;
    }
    return size;
  }

  async clear(): Promise<void> {
    this.models.clear();
    this.tensorChunks.clear();
    this.tokenizers.clear();
    this.syncProgress.clear();
    this.userAdapters.clear();
    this.trainingLog = [];
    this.nextLogId = 0;
  }
}
