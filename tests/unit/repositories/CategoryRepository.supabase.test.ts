import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseFake } from '../supabaseFake';
import { CategoryRepository } from '../../../src/repositories/categoryRepository';
import { CATEGORY_ID } from '../mocks';

// Substitui o cliente real do Supabase pelo cliente falso (mock do módulo).
vi.mock('../../../src/config/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  requireSupabaseClient: () => globalThis.pastificoSupabaseFake.client
}));

const row = { id: CATEGORY_ID, name: 'Massas', description: 'Artesanais', created_at: '2026-01-01T00:00:00.000Z' };
const entity = { id: CATEGORY_ID, name: 'Massas', description: 'Artesanais', createdAt: '2026-01-01T00:00:00.000Z' };
const dbError = { code: 'XX000', message: 'falha no banco' };

describe('CategoryRepository (modo Supabase, cliente mockado)', () => {
  const repository = new CategoryRepository();

  beforeEach(() => supabaseFake.reset());

  it('findAll converte as colunas do banco para o model e ordena por nome', async () => {
    supabaseFake.enqueue('categories', { data: [row] });
    await expect(repository.findAll()).resolves.toEqual([entity]);
    expect(supabaseFake.argsOf('categories', 'order')).toEqual(['name']);
  });

  it('findAll devolve lista vazia quando data é null e propaga erros', async () => {
    supabaseFake.enqueue('categories', { data: null }, { error: dbError });
    await expect(repository.findAll()).resolves.toEqual([]);
    await expect(repository.findAll()).rejects.toEqual(dbError);
  });

  it('findById ignora id que não é UUID sem consultar o banco', async () => {
    await expect(repository.findById('abc')).resolves.toBeUndefined();
    expect(supabaseFake.calls).toHaveLength(0);
  });

  it('findById encontra, não encontra ou propaga erro', async () => {
    supabaseFake.enqueue('categories', { data: row }, { data: null }, { error: dbError });
    await expect(repository.findById(CATEGORY_ID)).resolves.toEqual(entity);
    await expect(repository.findById(CATEGORY_ID)).resolves.toBeUndefined();
    await expect(repository.findById(CATEGORY_ID)).rejects.toEqual(dbError);
  });

  it('findByName usa ILIKE com curingas escapados', async () => {
    supabaseFake.enqueue('categories', { data: [row] }, { data: [] }, { error: dbError });
    await expect(repository.findByName(' 100%_massas ')).resolves.toEqual(entity);
    expect(supabaseFake.argsOf('categories', 'ilike')).toEqual(['name', '100\\%\\_massas']);
    await expect(repository.findByName('Nada')).resolves.toBeUndefined();
    await expect(repository.findByName('Erro')).rejects.toEqual(dbError);
  });

  it('create insere com UUID e devolve o registro criado', async () => {
    supabaseFake.enqueue('categories', { data: row }, { error: dbError });
    await expect(repository.create({ name: 'Massas', description: 'Artesanais' })).resolves.toEqual(entity);
    const [inserted] = supabaseFake.argsOf('categories', 'insert') as [Record<string, string>];
    expect(inserted).toMatchObject({ name: 'Massas', description: 'Artesanais' });
    expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(repository.create({ name: 'X', description: 'Y' })).rejects.toEqual(dbError);
  });

  it('update grava as mudanças, trata id inválido, registro inexistente e erro', async () => {
    await expect(repository.update('abc', { name: 'x' })).resolves.toBeUndefined();

    supabaseFake.enqueue('categories', { data: { ...row, name: 'Novas' } }, { data: null }, { error: dbError });
    await expect(repository.update(CATEGORY_ID, { name: 'Novas' })).resolves.toMatchObject({ name: 'Novas' });
    await expect(repository.update(CATEGORY_ID, { name: 'Novas' })).resolves.toBeUndefined();
    await expect(repository.update(CATEGORY_ID, { name: 'Novas' })).rejects.toEqual(dbError);
  });

  it('remove usa count exato para saber se apagou', async () => {
    await expect(repository.remove('abc')).resolves.toBe(false);

    supabaseFake.enqueue('categories', { count: 1 }, { count: 0 }, { error: dbError });
    await expect(repository.remove(CATEGORY_ID)).resolves.toBe(true);
    await expect(repository.remove(CATEGORY_ID)).resolves.toBe(false);
    await expect(repository.remove(CATEGORY_ID)).rejects.toEqual(dbError);
  });
});
