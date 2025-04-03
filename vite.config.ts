// vite.config.ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'path';

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
      external: ['fs', 'path', 'url', 'crypto'],
      input: {
        main: path.resolve(__dirname, 'src/index.ts'),
      },
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true, // Create a single index.d.ts entry point
      outDir: 'dist', // Ensure types go into the dist directory
    }),
  ],
  resolve: {
    alias: {
      // Add aliases if needed, e.g., for src directory
      // '@': path.resolve(__dirname, './src'),
    },
  },
});
