import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseFake } from '../supabaseFake';
import { ProductRepository } from '../../../src/repositories/productRepository';
import { CATEGORY_ID, PRODUCT_ID } from '../mocks';

vi.mock('../../../src/config/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  requireSupabaseClient: () => globalThis.pastificoSupabaseFake.client
}));

const row = {
  id: PRODUCT_ID,
  name: 'Tiramisu',
  description: 'Clássico',
  price: '21.90',
  image: '/images/tiramisu.jpg',
  is_available: true,
  category_id: CATEGORY_ID,
  created_at: '2026-01-01T00:00:00.000Z'
};
const dbError = { code: 'XX000', message: 'falha no banco' };

describe('ProductRepository (modo Supabase, cliente mockado)', () => {
  const repository = new ProductRepository();

  beforeEach(() => supabaseFake.reset());

  it('findAll converte snake_case e o preço numeric (texto) para número', async () => {
    supabaseFake.enqueue('products', { data: [row] }, { data: null }, { error: dbError });
    const [product] = await repository.findAll();
    expect(product).toMatchObject({ price: 21.9, isAvailable: true, categoryId: CATEGORY_ID, createdAt: row.created_at });
    await expect(repository.findAll()).resolves.toEqual([]);
    await expect(repository.findAll()).rejects.toEqual(dbError);
  });

  it('findById trata UUID inválido, encontrado, não encontrado e erro', async () => {
    await expect(repository.findById('x')).resolves.toBeUndefined();
    supabaseFake.enqueue('products', { data: row }, { data: null }, { error: dbError });
    await expect(repository.findById(PRODUCT_ID)).resolves.toMatchObject({ id: PRODUCT_ID });
    await expect(repository.findById(PRODUCT_ID)).resolves.toBeUndefined();
    await expect(repository.findById(PRODUCT_ID)).rejects.toEqual(dbError);
  });

  it('findByName encontra, não encontra e propaga erro', async () => {
    supabaseFake.enqueue('products', { data: [row] }, { data: null }, { error: dbError });
    await expect(repository.findByName('tiramisu')).resolves.toMatchObject({ name: 'Tiramisu' });
    await expect(repository.findByName('nada')).resolves.toBeUndefined();
    await expect(repository.findByName('erro')).rejects.toEqual(dbError);
  });

  it('countByCategory conta produtos da categoria', async () => {
    await expect(repository.countByCategory('x')).resolves.toBe(0);
    supabaseFake.enqueue('products', { count: 2 }, { count: null }, { error: dbError });
    await expect(repository.countByCategory(CATEGORY_ID)).resolves.toBe(2);
    expect(supabaseFake.argsOf('products', 'eq')).toEqual(['category_id', CATEGORY_ID]);
    await expect(repository.countByCategory(CATEGORY_ID)).resolves.toBe(0);
    await expect(repository.countByCategory(CATEGORY_ID)).rejects.toEqual(dbError);
  });

  it('create converte o model para as colunas da tabela', async () => {
    supabaseFake.enqueue('products', { data: row }, { error: dbError });
    const input = { name: 'Tiramisu', description: 'Clássico', price: 21.9, image: '/images/tiramisu.jpg', isAvailable: true, categoryId: CATEGORY_ID };

    await expect(repository.create(input)).resolves.toMatchObject({ id: PRODUCT_ID });
    const [inserted] = supabaseFake.argsOf('products', 'insert') as [Record<string, unknown>];
    expect(inserted).toMatchObject({ name: 'Tiramisu', price: 21.9, is_available: true, category_id: CATEGORY_ID });
    expect(inserted).not.toHaveProperty('isAvailable');

    await expect(repository.create(input)).rejects.toEqual(dbError);
  });

  it('update envia só as colunas alteradas', async () => {
    await expect(repository.update('x', { price: 1 })).resolves.toBeUndefined();

    supabaseFake.enqueue('products', { data: { ...row, price: 25 } }, { data: null }, { error: dbError });
    await expect(repository.update(PRODUCT_ID, { price: 25, isAvailable: false, categoryId: CATEGORY_ID })).resolves.toMatchObject({ price: 25 });
    expect(supabaseFake.argsOf('products', 'update')).toEqual([{ price: 25, is_available: false, category_id: CATEGORY_ID }]);

    await expect(repository.update(PRODUCT_ID, { name: 'X', description: 'Y', image: '/z.jpg' })).resolves.toBeUndefined();
    await expect(repository.update(PRODUCT_ID, { price: 1 })).rejects.toEqual(dbError);
  });

  it('remove converte violação de chave estrangeira (23503) em 409', async () => {
    await expect(repository.remove('x')).resolves.toBe(false);

    supabaseFake.enqueue('products', { count: 1 }, { error: { code: '23503' } }, { error: dbError });
    await expect(repository.remove(PRODUCT_ID)).resolves.toBe(true);
    await expect(repository.remove(PRODUCT_ID)).rejects.toMatchObject({ statusCode: 409 });
    await expect(repository.remove(PRODUCT_ID)).rejects.toEqual(dbError);
  });
});
