# Edgework SDK Data

The Data module provides primitives for local data storage and synchronization.

## Modules

### `storage`
Interfaces and implementations for local persistence (e.g., IndexedDB, SQLite via WASM).

### `sync`
Synchronization protocols for keeping local data in sync with the cloud or peer-to-peer nodes.

## Usage

```typescript
import { Storage } from '@edgework/sdk/data';
```

Last Updated: 2026-01-31

## Sub-Directories

- **[Storage](./storage)**
- **[Sync](./sync)**