import './setup';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, createProduct, findSeedProduct, UNKNOWN_ID, UUID_REGEX } from './helpers';

const createOrder = async (productName: string, extra: Record<string, unknown> = {}, item: Record<string, unknown> = {}) => {
  const product = await findSeedProduct(productName);
  return api().post('/orders').send({
    customerName: 'Maria',
    tableNumber: 5,
    items: [{ productId: product.id, quantity: 1, ...item }],
    ...extra
  });
};

describe('Pedidos', () => {
  describe('POST /orders', () => {
    test('cria o pedido (201) com status Recebido, pagamento padrão e total calculado', async () => {
      const response = await createOrder('Spaghetti Carbonara', {}, { quantity: 2 });

      assert.equal(response.status, 201);
      assert.match(response.body.id, UUID_REGEX);
      assert.equal(response.body.status, 'Recebido');
      assert.equal(response.body.customerName, 'Maria');
      assert.equal(response.body.paymentMethod, 'Dinheiro');
      assert.equal(response.body.paymentStatus, 'Aguardando no caixa');
      assert.equal(response.body.items.length, 1);
      assert.equal(response.body.total, 85.8);
    });

    test('soma os adicionais de prato no preço (Carbonara + Bacon crocante)', async () => {
      const response = await createOrder('Spaghetti Carbonara', { paymentMethod: 'PIX' }, { options: ['Bacon crocante'] });

      assert.equal(response.status, 201);
      assert.equal(response.body.items[0].unitPrice, 47.9);
      assert.equal(response.body.paymentMethod, 'PIX');
    });

    test('aplica preço de taça para vinho', async () => {
      const response = await createOrder('Chianti Classico', {}, { options: ['Taça de vinho'] });
      assert.equal(response.status, 201);
      assert.equal(response.body.items[0].unitPrice, 18);
    });

    test('aplica preço de lata e adicionais para refrigerante', async () => {
      const response = await createOrder('Coca-Cola 600ml', {}, { options: ['Lata 350 ml', 'Copo com gelo', 'Com limão'] });
      assert.equal(response.status, 201);
      assert.equal(response.body.items[0].unitPrice, 10);
    });

    test('soma os adicionais de sobremesa', async () => {
      const response = await createOrder('Tiramisu', {}, { options: ['Chantilly'] });
      assert.equal(response.status, 201);
      assert.equal(response.body.items[0].unitPrice, 24.9);
    });

    test('retorna 400 para adicionais incompatíveis com o produto', async () => {
      const cases: Array<[string, string]> = [
        ['Chianti Classico', 'Bacon crocante'],
        ['Coca-Cola 600ml', 'Taça de vinho'],
        ['Tiramisu', 'Bacon crocante'],
        ['Spaghetti Carbonara', 'Chantilly'],
        ['Spaghetti Carbonara', 'toString'],
        ['Tiramisu', 'constructor']
      ];
      for (const [productName, option] of cases) {
        const response = await createOrder(productName, {}, { options: [option] });
        assert.equal(response.status, 400, `${productName} + ${option} deveria ser rejeitado`);
      }
    });

    test('retorna 400 quando faltam campos obrigatórios ou o corpo está vazio', async () => {
      assert.equal((await api().post('/orders').send({})).status, 400);
      assert.equal((await api().post('/orders')).status, 400);
      assert.equal((await api().post('/orders').send({ customerName: 'Ana', tableNumber: 1, items: [] })).status, 400);
    });

    test('retorna 400 para customerName que não é texto (antes gerava 500)', async () => {
      const response = await createOrder('Spaghetti Carbonara', { customerName: 42 });
      assert.equal(response.status, 400);
    });

    test('retorna 400 para mesa inválida', async () => {
      for (const tableNumber of [0, -3, 2.5, 'abc']) {
        const response = await createOrder('Spaghetti Carbonara', { tableNumber });
        assert.equal(response.status, 400, `mesa ${String(tableNumber)} deveria ser rejeitada`);
      }
    });

    test('retorna 400 para método de pagamento inválido', async () => {
      const response = await createOrder('Spaghetti Carbonara', { paymentMethod: 'Bitcoin' });
      assert.equal(response.status, 400);
    });

    test('retorna 400 para itens malformados', async () => {
      const base = { customerName: 'Ana', tableNumber: 2 };
      const invalidItems: unknown[] = [
        'não é lista',
        [null],
        ['texto'],
        [{ productId: 'abc' }],
        [{ productId: UNKNOWN_ID }],
        [{ productId: (await findSeedProduct('Caprese')).id, quantity: 0 }],
        [{ productId: (await findSeedProduct('Caprese')).id, quantity: 1.5 }],
        [{ productId: (await findSeedProduct('Caprese')).id, options: 'Bacon crocante' }]
      ];

      for (const items of invalidItems) {
        const response = await api().post('/orders').send({ ...base, items });
        assert.equal(response.status, 400, `itens ${JSON.stringify(items)} deveriam ser rejeitados`);
        assert.ok(response.body.message);
      }
    });

    test('retorna 400 para produto indisponível', async () => {
      const product = await createProduct({ isAvailable: false });
      const response = await api().post('/orders').send({
        customerName: 'Ana',
        tableNumber: 2,
        items: [{ productId: product.body.id }]
      });
      assert.equal(response.status, 400);
      assert.match(response.body.message, /indisponível/);
    });
  });

  describe('GET /orders e GET /orders/:id', () => {
    test('lista os pedidos (200)', async () => {
      await createOrder('Caprese');
      const response = await api().get('/orders');

      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.body));
      assert.ok(response.body.length >= 1);
    });

    test('consulta um pedido pelo id (200)', async () => {
      const created = await createOrder('Arancini');
      const response = await api().get(`/orders/${created.body.id}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.id, created.body.id);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      assert.equal((await api().get(`/orders/${UNKNOWN_ID}`)).status, 404);
      assert.equal((await api().get('/orders/123')).status, 400);
    });
  });

  describe('PATCH /orders/:id/status', () => {
    test('atualiza o status (200)', async () => {
      const created = await createOrder('Lasanha à Bolonhesa');
      const response = await api().patch(`/orders/${created.body.id}/status`).send({ status: 'Preparando' });

      assert.equal(response.status, 200);
      assert.equal(response.body.status, 'Preparando');
    });

    test('retorna 400 para status inválido ou ausente', async () => {
      const created = await createOrder('Caponata');
      assert.equal((await api().patch(`/orders/${created.body.id}/status`).send({ status: 'Cancelado' })).status, 400);
      assert.equal((await api().patch(`/orders/${created.body.id}/status`)).status, 400);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      assert.equal((await api().patch(`/orders/${UNKNOWN_ID}/status`).send({ status: 'Pronto' })).status, 404);
      assert.equal((await api().patch('/orders/abc/status').send({ status: 'Pronto' })).status, 400);
    });
  });

  describe('DELETE /orders/:id', () => {
    test('remove o pedido (204) e depois retorna 404', async () => {
      const created = await createOrder('Tiramisu');

      assert.equal((await api().delete(`/orders/${created.body.id}`)).status, 204);
      assert.equal((await api().get(`/orders/${created.body.id}`)).status, 404);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      assert.equal((await api().delete(`/orders/${UNKNOWN_ID}`)).status, 404);
      assert.equal((await api().delete('/orders/abc')).status, 400);
    });
  });

  describe('Cozinha', () => {
    test('GET /orders/kitchen lista apenas pedidos não entregues', async () => {
      const delivered = await createOrder('Bruschetta Clássica');
      await api().patch(`/orders/${delivered.body.id}/status`).send({ status: 'Entregue' });
      const pending = await createOrder('Bruschetta Clássica');

      for (const path of ['/orders/kitchen', '/kitchen']) {
        const response = await api().get(path);
        assert.equal(response.status, 200);
        const ids = response.body.map((order: { id: string }) => order.id);
        assert.ok(ids.includes(pending.body.id));
        assert.ok(!ids.includes(delivered.body.id));
        assert.ok(response.body.every((order: { status: string }) => order.status !== 'Entregue'));
      }
    });

    test('GET /orders/table/:tableNumber lista os pedidos da mesa', async () => {
      const created = await createOrder('Caprese', { tableNumber: 42 });
      const response = await api().get('/orders/table/42');

      assert.equal(response.status, 200);
      assert.ok(response.body.some((order: { id: string }) => order.id === created.body.id));
      assert.ok(response.body.every((order: { tableNumber: number }) => order.tableNumber === 42));
    });

    test('GET /orders/table/:tableNumber retorna 400 para mesa inválida', async () => {
      for (const table of ['abc', '0', '5.5', '-1']) {
        const response = await api().get(`/orders/table/${table}`);
        assert.equal(response.status, 400, `mesa ${table} deveria ser rejeitada`);
      }
    });
  });
});
