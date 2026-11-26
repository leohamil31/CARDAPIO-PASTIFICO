import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { api } from '../helpers';
import { ensureDatabaseFile, saveDatabase, PersistedDatabase } from '../../src/config/localDatabase';
import { errorHandler, HttpError } from '../../src/middlewares/errorHandler';
import { escapeLikePattern } from '../../src/utils/text';

/** Resposta falsa mínima para testar o errorHandler isoladamente. */
const fakeResponse = () => {
  const captured: { status?: number; body?: { message: string } } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: { message: string }) {
      captured.body = body;
      return this;
    }
  };
  return { res: res as unknown as Response, captured };
};

const runErrorHandler = (error: unknown) => {
  const { res, captured } = fakeResponse();
  errorHandler(error, {} as Request, res, (() => undefined) as NextFunction);
  return captured;
};

describe('Sistema', () => {
  test('GET /api/health informa persistência local nos testes', async () => {
    const response = await api().get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.persistence).toBe('local-json');
    expect(response.body.endpoints.includes('POST /orders')).toBeTruthy();
  });

  test('GET /api-docs/openapi.json retorna a especificação OpenAPI com todas as rotas', async () => {
    const response = await api().get('/api-docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.3');
    for (const path of ['/categories', '/categories/{id}', '/products', '/products/{id}', '/orders', '/orders/{id}', '/orders/{id}/status']) {
      expect(response.body.paths[path], `rota ${path} ausente na documentação`).toBeTruthy();
    }
    expect(response.body.info.description).toMatch(/Leonardo Hamilton Moreira de Camargo/);
  });

  test('GET /api-docs retorna a página do Swagger UI', async () => {
    const response = await api().get('/api-docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toMatch(/swagger-ui/);
  });

  test('com KITCHEN_PIN definido, rotas da equipe exigem o cabeçalho x-kitchen-pin', async () => {
    process.env.KITCHEN_PIN = '4321';
    try {
      expect((await api().get('/orders')).status).toBe(401);
      expect((await api().get('/orders').set('x-kitchen-pin', '0000')).status).toBe(401);
      expect((await api().get('/orders').set('x-kitchen-pin', '4321')).status).toBe(200);
      expect((await api().get('/kitchen')).status).toBe(401);
      expect((await api().post('/categories').send({ name: 'x', description: 'y' })).status).toBe(401);
      // O cardápio continua público para o cliente.
      expect((await api().get('/products')).status).toBe(200);
    } finally {
      delete process.env.KITCHEN_PIN;
    }
  });

  test('respostas trazem cabeçalhos básicos de segurança', async () => {
    const response = await api().get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  test('páginas do front-end respondem 200', async () => {
    for (const path of ['/', '/kitchen-dashboard', '/order-status', '/order-history']) {
      const response = await api().get(path);
      expect(response.status, path).toBe(200);
      expect(response.text).toMatch(/Pastifico/i);
    }
  });

  test('rota inexistente retorna 404 em JSON', async () => {
    const response = await api().get('/rota-que-nao-existe');

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/Rota não encontrada/);
  });

  test('ensureDatabaseFile remove categorias/produtos duplicados e normaliza imagens', () => {
    const stale = {
      categories: [
        { id: 'massas-1', name: 'Massas', description: 'Mais massas', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'massas-2', name: 'Massas', description: 'duplicado', createdAt: '2026-09-18T00:00:00.000Z' }
      ],
      products: [
        { id: 'p1', name: 'Produto X', description: 'curta', price: 1, image: 'imagem-invalida', isAvailable: true, categoryId: 'massas-1', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'p2', name: 'produto x', description: 'duplicado', price: 1, image: '/a.jpg', isAvailable: true, categoryId: 'massas-1', createdAt: '2026-01-01T00:00:00.000Z' }
      ],
      orders: []
    } as unknown as PersistedDatabase;

    const before = ensureDatabaseFile();
    saveDatabase(stale);

    const normalized = ensureDatabaseFile();
    expect(normalized.categories.length).toBe(1);
    expect(normalized.products.length).toBe(1);
    expect(normalized.products[0].image.startsWith('http')).toBeTruthy();

    saveDatabase(before);
  });

  test('ensureDatabaseFile recria o seed quando o arquivo está corrompido', () => {
    const before = ensureDatabaseFile();
    fs.writeFileSync(process.env.PASTIFICO_DB_PATH as string, '{ corrompido', 'utf8');

    const recovered = ensureDatabaseFile();
    expect(recovered.categories.length >= 4).toBeTruthy();

    saveDatabase(before);
  });
});

describe('errorHandler', () => {
  test('usa o status do HttpError', () => {
    const result = runErrorHandler(new HttpError(418, 'Sou um bule.'));
    expect(result).toEqual({ status: 418, body: { message: 'Sou um bule.' } });
  });

  test('converte erros do PostgreSQL em 409/400', () => {
    expect(runErrorHandler({ code: '23505', message: 'duplicate key' }).status).toBe(409);
    expect(runErrorHandler({ code: '23503', message: 'foreign key' }).status).toBe(409);
    expect(runErrorHandler({ code: '22P02', message: 'invalid uuid' }).status).toBe(400);
    expect(runErrorHandler({ code: '23514', message: 'check' }).status).toBe(400);
  });

  test('respeita erros 4xx do body-parser', () => {
    expect(runErrorHandler({ type: 'entity.too.large', status: 413, message: 'too large' }).status).toBe(413);
    expect(runErrorHandler({ status: 415, message: 'unsupported charset' }).status).toBe(415);
  });

  test('erro inesperado vira 500 sem vazar detalhes internos', () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const result = runErrorHandler(new Error('senha do banco: 123'));
      expect(result.status).toBe(500);
      expect(result.body?.message).toBe('Erro interno do servidor.');
      expect(runErrorHandler('texto qualquer').status).toBe(500);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe('utils', () => {
  test('escapeLikePattern escapa curingas do ILIKE', () => {
    expect(escapeLikePattern('100%_massa\\')).toBe('100\\%\\_massa\\\\');
  });
});
