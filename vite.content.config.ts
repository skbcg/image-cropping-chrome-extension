import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/content/index.tsx',
      output: {
        entryFileNames: 'content.js',
        format: 'es',
        inlineDynamicImports: true,
      },
    },
    target: 'es2022',
    minify: false,
  },
  publicDir: false,
});
