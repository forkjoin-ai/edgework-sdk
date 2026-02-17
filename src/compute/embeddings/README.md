# Embeddings Module

Semantic embedding infrastructure for similarity search, clustering, and content recommendation within the Edgework SDK.

## Components

| File | Description |
|------|-------------|
| `embedding-model.ts` | Defines embedding model interfaces and configurations (`EMBEDDING_MODELS`). |
| `embedding-cache.ts` | Caching layer for computed embeddings to reduce redundant API calls. |
| `semantic-search.ts` | `SemanticSearchEngine` for vector-based content search. |
| `similarity-engine.ts` | `SimilarityEngine` for finding similar content pairs. |

## Usage

```typescript
import { SemanticSearchEngine, EmbeddingCache } from '@emotions-app/edgework-sdk/compute/embeddings';

const cache = new EmbeddingCache({ /* config */ });
const search = new SemanticSearchEngine({ cache });
const results = await search.query('emotional wellness tips');
```

## Testing

Tests are located in `embeddings.test.ts`.

Last Updated: 2026-01-31