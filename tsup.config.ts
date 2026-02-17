import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'data/storage/index': 'src/data/storage/index.ts',
    'data/sync/index': 'src/data/sync/index.ts',
    'compute/index': 'src/compute/index.ts',
    'compute/gateway/index': 'src/compute/gateway/index.ts',
    'compute/distributed/index': 'src/compute/distributed/index.ts',
    'compute/inference/index': 'src/compute/inference/index.ts',
    'compute/rlhf/index': 'src/compute/rlhf/index.ts',
    'react/index': 'src/react/index.ts',
    'auth/index': 'src/auth/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['@anthropic-ai/sdk', 'react'],
});
