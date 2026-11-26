/**
 * Executado pelo Vitest antes de cada arquivo de teste (ver vitest.config.mts).
 * - Desliga o Supabase: os testes nunca tocam no banco remoto, mesmo com .env preenchido
 *   (o dotenv não sobrescreve variáveis que já existem em process.env).
 * - Aponta o "banco" local para um arquivo temporário exclusivo deste arquivo de teste,
 *   para que os testes rodem em paralelo sem alterar data/pastifico-db.json.
 * - Ao final, apaga o arquivo temporário (limpeza dos registros criados nos testes).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll } from 'vitest';

process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
delete process.env.KITCHEN_PIN;
process.env.PASTIFICO_DB_PATH = path.join(os.tmpdir(), `pastifico-test-${process.pid}-${randomUUID()}.json`);

afterAll(() => {
  fs.rmSync(process.env.PASTIFICO_DB_PATH as string, { force: true });
});
