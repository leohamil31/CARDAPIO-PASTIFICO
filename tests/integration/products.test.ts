import { describe, test, expect } from 'vitest';
import { api, createCategory, createProduct, findSeedProduct, UNKNOWN_ID, unique, UUID_REGEX } from '../helpers';

describe('Produtos', () => {
  describe('GET /products', () => {
    test('retorna 200 com o cardápio e URLs de imagem válidas', async () => {
      const response = await api().get('/products');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBeTruthy();
      expect(response.body.length >= 8).toBeTruthy();
      expect(response.body.every((product: { image: string }) => product.image.startsWith('http') || product.image.startsWith('/'))).toBeTruthy();
    });
  });

  describe('GET /products/:id', () => {
    test('retorna 200 e o produto', async () => {
      const carbonara = await findSeedProduct('Spaghetti Carbonara');
      const response = await api().get(`/products/${carbonara.id}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Spaghetti Carbonara');
    });

    test('retorna 404 para id inexistente', async () => {
      const response = await api().get(`/products/${UNKNOWN_ID}`);
      expect(response.status).toBe(404);
    });

    test('retorna 400 para id inválido', async () => {
      const response = await api().get('/products/xyz');
      expect(response.status).toBe(400);
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

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(name);
      expect(response.body.price).toBe(36.5);
      expect(response.body.isAvailable, 'isAvailable deve ser true por padrão').toBe(true);
      expect(response.body.categoryId).toBe(category.body.id);
      expect(response.body.id).toMatch(UUID_REGEX);
    });

    test('retorna 400 listando os campos ausentes', async () => {
      const response = await api().post('/products').send({ name: 'Incompleto' });
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/description/);
      expect(response.body.message).toMatch(/categoryId/);
    });

    test('retorna 400 para preço negativo ou não numérico', async () => {
      for (const price of [-1, 'abc', null]) {
        const response = await createProduct({ price });
        expect(response.status, `preço ${String(price)} deveria ser rejeitado`).toBe(400);
      }
    });

    test('retorna 400 para isAvailable que não é booleano', async () => {
      const response = await createProduct({ isAvailable: 'talvez' });
      expect(response.status).toBe(400);
    });

    test('retorna 400 para imagem com esquema perigoso (javascript:, data:)', async () => {
      for (const image of ['javascript:alert(1)', 'data:text/html,<b>x</b>', '//evil.example/x.jpg']) {
        const response = await createProduct({ image });
        expect(response.status, image).toBe(400);
        expect(response.body.message).toMatch(/image/);
      }
    });

    test('retorna 400 para categoryId inválido ou inexistente', async () => {
      const invalid = await api().post('/products').send({
        name: unique('P'), description: 'd', price: 1, image: '/i.jpg', categoryId: 'massas'
      });
      expect(invalid.status).toBe(400);

      const missing = await createProduct({ categoryId: UNKNOWN_ID });
      expect(missing.status).toBe(400);
      expect(missing.body.message).toMatch(/categoria/i);
    });

    test('retorna 409 para nome duplicado', async () => {
      const created = await createProduct();
      const response = await createProduct({ name: created.body.name });
      expect(response.status).toBe(409);
    });
  });

  describe('PUT /products/:id', () => {
    test('atualiza preço e disponibilidade (200)', async () => {
      const created = await createProduct();
      const response = await api().put(`/products/${created.body.id}`).send({ price: 52.9, isAvailable: false });

      expect(response.status).toBe(200);
      expect(response.body.price).toBe(52.9);
      expect(response.body.isAvailable).toBe(false);
      expect(response.body.name).toBe(created.body.name);
    });

    test('ignora campos protegidos (id e createdAt) e campos desconhecidos', async () => {
      const created = await createProduct();
      const response = await api().put(`/products/${created.body.id}`).send({
        id: UNKNOWN_ID,
        createdAt: '1999-01-01T00:00:00.000Z',
        hacker: true,
        description: 'Nova descrição'
      });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(created.body.id);
      expect(response.body.createdAt).toBe(created.body.createdAt);
      expect(response.body.hacker).toBeUndefined();
      expect(response.body.description).toBe('Nova descrição');
    });

    test('permite trocar de categoria quando ela existe', async () => {
      const created = await createProduct();
      const otherCategory = await createCategory();
      const response = await api().put(`/products/${created.body.id}`).send({ categoryId: otherCategory.body.id });

      expect(response.status).toBe(200);
      expect(response.body.categoryId).toBe(otherCategory.body.id);
    });

    test('retorna 400 sem campos válidos, com preço inválido ou categoria inexistente', async () => {
      const created = await createProduct();

      expect((await api().put(`/products/${created.body.id}`).send({})).status).toBe(400);
      expect((await api().put(`/products/${created.body.id}`).send({ price: -5 })).status).toBe(400);
      expect((await api().put(`/products/${created.body.id}`).send({ categoryId: UNKNOWN_ID })).status).toBe(400);
    });

    test('retorna 409 ao renomear para um nome já existente', async () => {
      const created = await createProduct();
      const response = await api().put(`/products/${created.body.id}`).send({ name: 'Tiramisu' });
      expect(response.status).toBe(409);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      expect((await api().put(`/products/${UNKNOWN_ID}`).send({ price: 1 })).status).toBe(404);
      expect((await api().put('/products/1').send({ price: 1 })).status).toBe(400);
    });
  });

  describe('DELETE /products/:id', () => {
    test('remove o produto (204) e depois retorna 404', async () => {
      const created = await createProduct();

      expect((await api().delete(`/products/${created.body.id}`)).status).toBe(204);
      expect((await api().get(`/products/${created.body.id}`)).status).toBe(404);
    });

    test('retorna 409 quando o produto já aparece em um pedido', async () => {
      const created = await createProduct();
      const order = await api().post('/orders').send({
        customerName: 'Cliente',
        tableNumber: 1,
        items: [{ productId: created.body.id, quantity: 1 }]
      });
      expect(order.status).toBe(201);

      const response = await api().delete(`/products/${created.body.id}`);
      expect(response.status).toBe(409);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      expect((await api().delete(`/products/${UNKNOWN_ID}`)).status).toBe(404);
      expect((await api().delete('/products/abc')).status).toBe(400);
    });
  });
});
