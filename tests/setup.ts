/**
 * Importado ANTES do app em cada arquivo de teste.
 * - Desliga o Supabase (os testes nunca tocam no banco remoto, mesmo com .env preenchido;
 *   o dotenv não sobrescreve variáveis que já existem em process.env).
 * - Aponta o "banco" local para um arquivo temporário exclusivo deste processo,
 *   para que os arquivos de teste possam rodar em paralelo sem alterar data/pastifico-db.json.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after } from 'node:test';

process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.PASTIFICO_DB_PATH = path.join(os.tmpdir(), `pastifico-test-${process.pid}-${randomUUID()}.json`);

after(() => {
  fs.rmSync(process.env.PASTIFICO_DB_PATH as string, { force: true });
});
