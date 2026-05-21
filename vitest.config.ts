import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      'src/core/db/powersync/**',
    ],
    server: {
      deps: {
        external: [
          '@journeyapps/wa-sqlite',
          '@powersync/web',
          '@powersync/common',
          '@powersync/kysely-driver',
        ],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/lib/**',
        'src/features/**/schemas/**',
      ],
      exclude: [
        'node_modules',
        'dist',
        'src/core/db/powersync/**',
        'src/routes/**',
        'src/**/*.gen.ts',
        'src/test/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
