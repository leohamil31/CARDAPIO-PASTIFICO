import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Roda antes de cada arquivo de teste: desliga o Supabase e usa um banco JSON temporário.
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // Apenas o ponto de entrada que abre a porta HTTP fica fora da medição.
      exclude: ['src/server.ts'],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 60
      }
    }
  }
});
