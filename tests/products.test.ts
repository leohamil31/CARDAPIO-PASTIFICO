import './setup';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, createCategory, createProduct, findSeedProduct, UNKNOWN_ID, unique, UUID_REGEX } from './helpers';

describe('Produtos', () => {
  describe('GET /products', () => {
    test('retorna 200 com o cardápio e URLs de imagem válidas', async () => {
      const response = await api().get('/products');

      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.body));
      assert.ok(response.body.length >= 8);
      assert.ok(response.body.every((product: { image: string }) => product.image.startsWith('http') || product.image.startsWith('/')));
    });
  });

  describe('GET /products/:id', () => {
    test('retorna 200 e o produto', async () => {
      const carbonara = await findSeedProduct('Spaghetti Carbonara');
      const response = await api().get(`/products/${carbonara.id}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.name, 'Spaghetti Carbonara');
    });

    test('retorna 404 para id inexistente', async () => {
      const response = await api().get(`/products/${UNKNOWN_ID}`);
      assert.equal(response.status, 404);
    });

    test('retorna 400 para id inválido', async () => {
      const response = await api().get('/products/xyz');
      assert.equal(response.status, 400);
    });
  });

  describe('POST /products', () => {
    test('cria o produto (201) com id UUID', async () => {
      const category = await createCategory();
      const name = unique('Penne teste');
      const response = await api().post('/products').send({
        name,
        description: 'Penne ao molho de tomate fresco com manjericão.',
        price: '36.5',
        image: 'https://example.com/penne.jpg',
        categoryId: category.body.id
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.name, name);
      assert.equal(response.body.price, 36.5);
      assert.equal(response.body.isAvailable, true, 'isAvailable deve ser true por padrão');
      assert.equal(response.body.categoryId, category.body.id);
      assert.match(response.body.id, UUID_REGEX);
    });

    test('retorna 400 listando os campos ausentes', async () => {
      const response = await api().post('/products').send({ name: 'Incompleto' });
      assert.equal(response.status, 400);
      assert.match(response.body.message, /description/);
      assert.match(response.body.message, /categoryId/);
    });

    test('retorna 400 para preço negativo ou não numérico', async () => {
      for (const price of [-1, 'abc', null]) {
        const response = await createProduct({ price });
        assert.equal(response.status, 400, `preço ${String(price)} deveria ser rejeitado`);
      }
    });

    test('retorna 400 para isAvailable que não é booleano', async () => {
      const response = await createProduct({ isAvailable: 'talvez' });
      assert.equal(response.status, 400);
    });

    test('retorna 400 para categoryId inválido ou inexistente', async () => {
      const invalid = await api().post('/products').send({
        name: unique('P'), description: 'd', price: 1, image: '/i.jpg', categoryId: 'massas'
      });
      assert.equal(invalid.status, 400);

      const missing = await createProduct({ categoryId: UNKNOWN_ID });
      assert.equal(missing.status, 400);
      assert.match(missing.body.message, /categoria/i);
    });

    test('retorna 409 para nome duplicado', async () => {
      const created = await createProduct();
      const response = await createProduct({ name: created.body.name });
      assert.equal(response.status, 409);
    });
  });

  describe('PUT /products/:id', () => {
    test('atualiza preço e disponibilidade (200)', async () => {
      const created = await createProduct();
      const response = await api().put(`/products/${created.body.id}`).send({ price: 52.9, isAvailable: false });

      assert.equal(response.status, 200);
      assert.equal(response.body.price, 52.9);
      assert.equal(response.body.isAvailable, false);
      assert.equal(response.body.name, created.body.name);
    });

    test('ignora campos protegidos (id e createdAt) e campos desconhecidos', async () => {
      const created = await createProduct();
      const response = await api().put(`/products/${created.body.id}`).send({
        id: UNKNOWN_ID,
        createdAt: '1999-01-01T00:00:00.000Z',
        hacker: true,
        description: 'Nova descrição'
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.id, created.body.id);
      assert.equal(response.body.createdAt, created.body.createdAt);
      assert.equal(response.body.hacker, undefined);
      assert.equal(response.body.description, 'Nova descrição');
    });

    test('permite trocar de categoria quando ela existe', async () => {
      const created = await createProduct();
      const otherCategory = await createCategory();
      const response = await api().put(`/products/${created.body.id}`).send({ categoryId: otherCategory.body.id });

      assert.equal(response.status, 200);
      assert.equal(response.body.categoryId, otherCategory.body.id);
    });

    test('retorna 400 sem campos válidos, com preço inválido ou categoria inexistente', async () => {
      const created = await createProduct();

      assert.equal((await api().put(`/products/${created.body.id}`).send({})).status, 400);
      assert.equal((await api().put(`/products/${created.body.id}`).send({ price: -5 })).status, 400);
      assert.equal((await api().put(`/products/${created.body.id}`).send({ categoryId: UNKNOWN_ID })).status, 400);
    });

    test('retorna 409 ao renomear para um nome já existente', async () => {
      const created = await createProduct();
      const response = await api().put(`/products/${created.body.id}`).send({ name: 'Tiramisu' });
      assert.equal(response.status, 409);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      assert.equal((await api().put(`/products/${UNKNOWN_ID}`).send({ price: 1 })).status, 404);
      assert.equal((await api().put('/products/1').send({ price: 1 })).status, 400);
    });
  });

  describe('DELETE /products/:id', () => {
    test('remove o produto (204) e depois retorna 404', async () => {
      const created = await createProduct();

      assert.equal((await api().delete(`/products/${created.body.id}`)).status, 204);
      assert.equal((await api().get(`/products/${created.body.id}`)).status, 404);
    });

    test('retorna 409 quando o produto já aparece em um pedido', async () => {
      const created = await createProduct();
      const order = await api().post('/orders').send({
        customerName: 'Cliente',
        tableNumber: 1,
        items: [{ productId: created.body.id, quantity: 1 }]
      });
      assert.equal(order.status, 201);

      const response = await api().delete(`/products/${created.body.id}`);
      assert.equal(response.status, 409);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      assert.equal((await api().delete(`/products/${UNKNOWN_ID}`)).status, 404);
      assert.equal((await api().delete('/products/abc')).status, 400);
    });
  });
});
