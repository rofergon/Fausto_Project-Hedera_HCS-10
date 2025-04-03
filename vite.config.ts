// vite.config.ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'path';

const externalDependencies = [
  '@hashgraph/proto',
  '@hashgraph/sdk',
  'fetch-retry',
  'fs',
  'path',
  'url',
  'crypto',
];

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'HashgraphOnlineAgentKit', // Choose a suitable name
      fileName: (format) => `index.${format}.js`,
      formats: ['es'], // Build specifically for ES Modules
    },
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: externalDependencies,
      input: {
        main: path.resolve(__dirname, 'src/index.ts'),
      },
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts'],
      exclude: ['**/*.d.ts'],
      outDir: 'dist',
    }),
  ],
  resolve: {
    alias: {
      // Add aliases if needed, e.g., for src directory
      // '@': path.resolve(__dirname, './src'),
    },
  },
  ssr: {
    external: externalDependencies,
  },
});
