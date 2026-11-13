import './setup';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, createCategory, createProduct, UNKNOWN_ID, unique, UUID_REGEX } from './helpers';

describe('Categorias', () => {
  describe('GET /categories', () => {
    test('retorna 200 com a lista e os 4 grupos do cardápio', async () => {
      const response = await api().get('/categories');

      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.body));
      const names = response.body.map((category: { name: string }) => category.name);
      for (const expected of ['Massas', 'Entradas', 'Bebidas', 'Sobremesas']) {
        assert.ok(names.includes(expected), `categoria ${expected} ausente`);
      }
    });
  });

  describe('GET /categories/:id', () => {
    test('retorna 200 e a categoria com id UUID', async () => {
      const [first] = (await api().get('/categories')).body;
      const response = await api().get(`/categories/${first.id}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.id, first.id);
      assert.match(response.body.id, UUID_REGEX);
    });

    test('retorna 404 para id inexistente', async () => {
      const response = await api().get(`/categories/${UNKNOWN_ID}`);
      assert.equal(response.status, 404);
      assert.equal(response.body.message, 'Categoria não encontrada.');
    });

    test('retorna 400 para id que não é UUID', async () => {
      const response = await api().get('/categories/abc');
      assert.equal(response.status, 400);
      assert.match(response.body.message, /UUID/);
    });
  });

  describe('POST /categories', () => {
    test('cria a categoria (201) com id UUID e nome sem espaços extras', async () => {
      const name = unique('Especiais');
      const response = await api().post('/categories').send({ name: `  ${name}  `, description: 'Pratos especiais' });

      assert.equal(response.status, 201);
      assert.equal(response.body.name, name);
      assert.match(response.body.id, UUID_REGEX);
      assert.ok(response.body.createdAt);
    });

    test('retorna 400 quando faltam campos obrigatórios', async () => {
      const response = await api().post('/categories').send({ name: 'Sem descrição' });
      assert.equal(response.status, 400);
    });

    test('retorna 400 quando name não é texto', async () => {
      const response = await api().post('/categories').send({ name: 123, description: 'x' });
      assert.equal(response.status, 400);
      assert.match(response.body.message, /name/);
    });

    test('retorna 400 quando o corpo está vazio (sem Content-Type JSON)', async () => {
      const response = await api().post('/categories');
      assert.equal(response.status, 400);
    });

    test('retorna 400 quando o corpo é um JSON malformado', async () => {
      const response = await api().post('/categories').set('Content-Type', 'application/json').send('{"name": "x",');
      assert.equal(response.status, 400);
      assert.equal(response.body.message, 'O corpo da requisição não é um JSON válido.');
    });

    test('retorna 400 quando o corpo JSON é uma lista', async () => {
      const response = await api().post('/categories').send([{ name: 'x', description: 'y' }]);
      assert.equal(response.status, 400);
    });

    test('retorna 409 para nome duplicado (sem diferenciar maiúsculas)', async () => {
      const created = await createCategory();
      const response = await api().post('/categories').send({ name: created.body.name.toUpperCase(), description: 'dup' });
      assert.equal(response.status, 409);
    });
  });

  describe('PUT /categories/:id', () => {
    test('atualiza parcialmente a categoria (200)', async () => {
      const created = await createCategory();
      const response = await api().put(`/categories/${created.body.id}`).send({ description: 'Descrição atualizada.' });

      assert.equal(response.status, 200);
      assert.equal(response.body.description, 'Descrição atualizada.');
      assert.equal(response.body.name, created.body.name);
    });

    test('retorna 400 sem campos para atualizar', async () => {
      const created = await createCategory();
      const response = await api().put(`/categories/${created.body.id}`).send({});
      assert.equal(response.status, 400);
    });

    test('retorna 400 quando o campo é vazio', async () => {
      const created = await createCategory();
      const response = await api().put(`/categories/${created.body.id}`).send({ name: '   ' });
      assert.equal(response.status, 400);
    });

    test('retorna 409 ao renomear para um nome já existente', async () => {
      const first = await createCategory();
      const second = await createCategory();
      const response = await api().put(`/categories/${second.body.id}`).send({ name: first.body.name });
      assert.equal(response.status, 409);
    });

    test('retorna 404 para id inexistente', async () => {
      const response = await api().put(`/categories/${UNKNOWN_ID}`).send({ name: unique('Nova') });
      assert.equal(response.status, 404);
    });

    test('retorna 400 para id inválido', async () => {
      const response = await api().put('/categories/123').send({ name: 'x' });
      assert.equal(response.status, 400);
    });
  });

  describe('DELETE /categories/:id', () => {
    test('remove a categoria (204) e depois retorna 404', async () => {
      const created = await createCategory();

      const deleteResponse = await api().delete(`/categories/${created.body.id}`);
      assert.equal(deleteResponse.status, 204);

      const showResponse = await api().get(`/categories/${created.body.id}`);
      assert.equal(showResponse.status, 404);
    });

    test('retorna 409 quando há produtos vinculados', async () => {
      const category = await createCategory();
      await createProduct({ categoryId: category.body.id });

      const response = await api().delete(`/categories/${category.body.id}`);
      assert.equal(response.status, 409);
    });

    test('retorna 404 para id inexistente', async () => {
      const response = await api().delete(`/categories/${UNKNOWN_ID}`);
      assert.equal(response.status, 404);
    });

    test('retorna 400 para id inválido', async () => {
      const response = await api().delete('/categories/nao-e-uuid');
      assert.equal(response.status, 400);
    });
  });
});
