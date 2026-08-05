import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryDir = path.resolve(mobileDir, '..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(repositoryDir, 'src'),
      '@mobile': path.resolve(mobileDir, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(repositoryDir, 'src/test/setup.ts')],
    include: [path.resolve(mobileDir, 'src/**/*.test.{ts,tsx}')],
    clearMocks: true,
  },
});
