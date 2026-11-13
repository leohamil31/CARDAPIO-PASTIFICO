import './setup';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { api } from './helpers';
import { ensureDatabaseFile, saveDatabase, PersistedDatabase } from '../src/config/localDatabase';
import { errorHandler, HttpError } from '../src/middlewares/errorHandler';
import { escapeLikePattern } from '../src/utils/text';

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

    assert.equal(response.status, 200);
    assert.equal(response.body.persistence, 'local-json');
    assert.ok(response.body.endpoints.includes('POST /orders'));
  });

  test('GET /api-docs/openapi.json retorna a especificação OpenAPI com todas as rotas', async () => {
    const response = await api().get('/api-docs/openapi.json');

    assert.equal(response.status, 200);
    assert.equal(response.body.openapi, '3.0.3');
    for (const path of ['/categories', '/categories/{id}', '/products', '/products/{id}', '/orders', '/orders/{id}', '/orders/{id}/status']) {
      assert.ok(response.body.paths[path], `rota ${path} ausente na documentação`);
    }
    assert.match(response.body.info.description, /Leonardo Hamilton Moreira de Camargo/);
  });

  test('GET /api-docs retorna a página do Swagger UI', async () => {
    const response = await api().get('/api-docs');

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /html/);
    assert.match(response.text, /swagger-ui/);
  });

  test('páginas do front-end respondem 200', async () => {
    for (const path of ['/', '/kitchen-dashboard', '/order-status', '/order-history']) {
      const response = await api().get(path);
      assert.equal(response.status, 200, path);
      assert.match(response.text, /Pastifico/i);
    }
  });

  test('rota inexistente retorna 404 em JSON', async () => {
    const response = await api().get('/rota-que-nao-existe');

    assert.equal(response.status, 404);
    assert.match(response.body.message, /Rota não encontrada/);
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
    assert.equal(normalized.categories.length, 1);
    assert.equal(normalized.products.length, 1);
    assert.ok(normalized.products[0].image.startsWith('http'));

    saveDatabase(before);
  });

  test('ensureDatabaseFile recria o seed quando o arquivo está corrompido', () => {
    const before = ensureDatabaseFile();
    fs.writeFileSync(process.env.PASTIFICO_DB_PATH as string, '{ corrompido', 'utf8');

    const recovered = ensureDatabaseFile();
    assert.ok(recovered.categories.length >= 4);

    saveDatabase(before);
  });
});

describe('errorHandler', () => {
  test('usa o status do HttpError', () => {
    const result = runErrorHandler(new HttpError(418, 'Sou um bule.'));
    assert.deepEqual(result, { status: 418, body: { message: 'Sou um bule.' } });
  });

  test('converte erros do PostgreSQL em 409/400', () => {
    assert.equal(runErrorHandler({ code: '23505', message: 'duplicate key' }).status, 409);
    assert.equal(runErrorHandler({ code: '23503', message: 'foreign key' }).status, 409);
    assert.equal(runErrorHandler({ code: '22P02', message: 'invalid uuid' }).status, 400);
    assert.equal(runErrorHandler({ code: '23514', message: 'check' }).status, 400);
  });

  test('respeita erros 4xx do body-parser', () => {
    assert.equal(runErrorHandler({ type: 'entity.too.large', status: 413, message: 'too large' }).status, 413);
    assert.equal(runErrorHandler({ status: 415, message: 'unsupported charset' }).status, 415);
  });

  test('erro inesperado vira 500 sem vazar detalhes internos', () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const result = runErrorHandler(new Error('senha do banco: 123'));
      assert.equal(result.status, 500);
      assert.equal(result.body?.message, 'Erro interno do servidor.');
      assert.equal(runErrorHandler('texto qualquer').status, 500);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe('utils', () => {
  test('escapeLikePattern escapa curingas do ILIKE', () => {
    assert.equal(escapeLikePattern('100%_massa\\'), '100\\%\\_massa\\\\');
  });
});
