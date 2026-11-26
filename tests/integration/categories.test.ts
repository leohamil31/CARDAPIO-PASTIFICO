import { describe, test, expect } from 'vitest';
import { api, createCategory, createProduct, UNKNOWN_ID, unique, UUID_REGEX } from '../helpers';

describe('Categorias', () => {
  describe('GET /categories', () => {
    test('retorna 200 com a lista e os 4 grupos do cardápio', async () => {
      const response = await api().get('/categories');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBeTruthy();
      const names = response.body.map((category: { name: string }) => category.name);
      for (const expected of ['Massas', 'Entradas', 'Bebidas', 'Sobremesas']) {
        expect(names.includes(expected), `categoria ${expected} ausente`).toBeTruthy();
      }
    });
  });

  describe('GET /categories/:id', () => {
    test('retorna 200 e a categoria com id UUID', async () => {
      const [first] = (await api().get('/categories')).body;
      const response = await api().get(`/categories/${first.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(first.id);
      expect(response.body.id).toMatch(UUID_REGEX);
    });

    test('retorna 404 para id inexistente', async () => {
      const response = await api().get(`/categories/${UNKNOWN_ID}`);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Categoria não encontrada.');
    });

    test('retorna 400 para id que não é UUID', async () => {
      const response = await api().get('/categories/abc');
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/UUID/);
    });
  });

  describe('POST /categories', () => {
    test('cria a categoria (201) com id UUID e nome sem espaços extras', async () => {
      const name = unique('Especiais');
      const response = await api().post('/categories').send({ name: `  ${name}  `, description: 'Pratos especiais' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(name);
      expect(response.body.id).toMatch(UUID_REGEX);
      expect(response.body.createdAt).toBeTruthy();
    });

    test('retorna 400 quando faltam campos obrigatórios', async () => {
      const response = await api().post('/categories').send({ name: 'Sem descrição' });
      expect(response.status).toBe(400);
    });

    test('retorna 400 quando name não é texto', async () => {
      const response = await api().post('/categories').send({ name: 123, description: 'x' });
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/name/);
    });

    test('retorna 400 quando o corpo está vazio (sem Content-Type JSON)', async () => {
      const response = await api().post('/categories');
      expect(response.status).toBe(400);
    });

    test('retorna 400 quando o corpo é um JSON malformado', async () => {
      const response = await api().post('/categories').set('Content-Type', 'application/json').send('{"name": "x",');
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('O corpo da requisição não é um JSON válido.');
    });

    test('retorna 400 quando o corpo JSON é uma lista', async () => {
      const response = await api().post('/categories').send([{ name: 'x', description: 'y' }]);
      expect(response.status).toBe(400);
    });

    test('retorna 409 para nome duplicado (sem diferenciar maiúsculas)', async () => {
      const created = await createCategory();
      const response = await api().post('/categories').send({ name: created.body.name.toUpperCase(), description: 'dup' });
      expect(response.status).toBe(409);
    });
  });

  describe('PUT /categories/:id', () => {
    test('atualiza parcialmente a categoria (200)', async () => {
      const created = await createCategory();
      const response = await api().put(`/categories/${created.body.id}`).send({ description: 'Descrição atualizada.' });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Descrição atualizada.');
      expect(response.body.name).toBe(created.body.name);
    });

    test('retorna 400 sem campos para atualizar', async () => {
      const created = await createCategory();
      const response = await api().put(`/categories/${created.body.id}`).send({});
      expect(response.status).toBe(400);
    });

    test('retorna 400 quando o campo é vazio', async () => {
      const created = await createCategory();
      const response = await api().put(`/categories/${created.body.id}`).send({ name: '   ' });
      expect(response.status).toBe(400);
    });

    test('retorna 409 ao renomear para um nome já existente', async () => {
      const first = await createCategory();
      const second = await createCategory();
      const response = await api().put(`/categories/${second.body.id}`).send({ name: first.body.name });
      expect(response.status).toBe(409);
    });

    test('retorna 404 para id inexistente', async () => {
      const response = await api().put(`/categories/${UNKNOWN_ID}`).send({ name: unique('Nova') });
      expect(response.status).toBe(404);
    });

    test('retorna 400 para id inválido', async () => {
      const response = await api().put('/categories/123').send({ name: 'x' });
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /categories/:id', () => {
    test('remove a categoria (204) e depois retorna 404', async () => {
      const created = await createCategory();

      const deleteResponse = await api().delete(`/categories/${created.body.id}`);
      expect(deleteResponse.status).toBe(204);

      const showResponse = await api().get(`/categories/${created.body.id}`);
      expect(showResponse.status).toBe(404);
    });

    test('retorna 409 quando há produtos vinculados', async () => {
      const category = await createCategory();
      await createProduct({ categoryId: category.body.id });

      const response = await api().delete(`/categories/${category.body.id}`);
      expect(response.status).toBe(409);
    });

    test('retorna 404 para id inexistente', async () => {
      const response = await api().delete(`/categories/${UNKNOWN_ID}`);
      expect(response.status).toBe(404);
    });

    test('retorna 400 para id inválido', async () => {
      const response = await api().delete('/categories/nao-e-uuid');
      expect(response.status).toBe(400);
    });
  });
});
