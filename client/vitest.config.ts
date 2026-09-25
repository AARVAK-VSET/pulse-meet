import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@api': '/src/api',
      '@helpers': '/src/helpers',
      '@pages': '/src/pages',
      '@theme': '/src/theme',
      '@config': '/src/config',
      '@context': '/src/context',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
