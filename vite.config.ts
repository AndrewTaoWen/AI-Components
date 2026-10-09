import { defineConfig } from 'vitest/config';
export default defineConfig({
  build: { outDir: 'demo-dist' },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts*'], restoreMocks: true },
});
