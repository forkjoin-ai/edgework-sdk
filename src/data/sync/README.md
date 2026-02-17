# Edgework Model Sync

Logic for synchronizing model weights from remote CDN/Server to local storage.

## Purpose

Handles the download, integrity verification, and caching of model shards.

## Key Files

- **ModelSync** (`model-sync.ts`): Manages the download queue, progress reporting, and retry logic.
- **factory.ts**: Helper to instantiate sync manager.

## Usage

Internal usage by `Edgework.init`. Can be used standalone to pre-cache models.

```typescript
import { createModelSync } from './factory';

const sync = createModelSync(storage, { syncUrl: '...' });
await sync.startSync('cyrano-360m');
```

Last Updated: 2026-01-31