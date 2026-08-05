import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryDir = path.resolve(mobileDir, '..');

function isReactSingletonModule(id: string): boolean {
  return /(?:^|\/)node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:react|react-dom|scheduler)(?:\/|$)/.test(id);
}

export default defineConfig({
  root: mobileDir,
  plugins: [react()],
  publicDir: path.resolve(repositoryDir, 'public'),
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'scheduler',
      '@codemirror/autocomplete',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/language-data',
      '@codemirror/lint',
      '@codemirror/search',
      '@codemirror/state',
      '@codemirror/theme-one-dark',
      '@codemirror/view',
    ],
    alias: {
      '@': path.resolve(repositoryDir, 'src'),
      '@mobile': path.resolve(mobileDir, 'src'),
      '@milkdown/core': path.resolve(repositoryDir, 'vendor/milkdown/packages/core/src/index.ts'),
      '@milkdown/ctx': path.resolve(repositoryDir, 'vendor/milkdown/packages/ctx/src/index.ts'),
    },
  },
  base: './',
  build: {
    outDir: path.resolve(mobileDir, 'dist'),
    emptyOutDir: true,
    modulePreload: false,
    sourcemap: false,
    chunkSizeWarningLimit: 3600,
    rollupOptions: {
      treeshake: {
        manualPureFunctions: ['console.log', 'console.debug', 'console.info', 'console.trace'],
      },
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (isReactSingletonModule(normalizedId)) return 'react-vendor';
          if (!normalizedId.includes('node_modules')) return;
          if (normalizedId.includes('/d3-') || normalizedId.includes('/d3/')) return 'd3-vendor';
          if (normalizedId.includes('/cytoscape')) return 'cytoscape-vendor';
          if (normalizedId.includes('/@radix-ui/')) return 'ui-vendor';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false,
    headers: { 'Cache-Control': 'no-store' },
  },
});
