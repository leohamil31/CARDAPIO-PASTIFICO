import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** Sufixo curto para gerar nomes únicos (os nomes de categoria/produto são únicos). */
export const unique = (prefix: string): string => `${prefix} ${randomUUID().slice(0, 8)}`;

export const api = () => request(app);

export const createCategory = async (overrides: Record<string, unknown> = {}) => {
  const response = await api().post('/categories').send({
    name: unique('Categoria teste'),
    description: 'Categoria criada pelos testes automatizados.',
    ...overrides
  });
  return response;
};

export const createProduct = async (overrides: Record<string, unknown> = {}) => {
  const categoryId = overrides.categoryId ?? (await createCategory()).body.id;
  const response = await api().post('/products').send({
    name: unique('Produto teste'),
    description: 'Produto criado pelos testes automatizados.',
    price: 10,
    image: 'https://example.com/produto.jpg',
    isAvailable: true,
    ...overrides,
    categoryId
  });
  return response;
};

/** Busca um produto do cardápio inicial (seed) pelo nome. */
export const findSeedProduct = async (name: string): Promise<{ id: string; name: string; price: number }> => {
  const response = await api().get('/products');
  const product = response.body.find((item: { name: string }) => item.name === name);
  if (!product) throw new Error(`Produto de seed não encontrado: ${name}`);
  return product;
};
