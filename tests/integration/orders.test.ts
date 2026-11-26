import { describe, test, expect } from 'vitest';
import { api, createProduct, findSeedProduct, UNKNOWN_ID, UUID_REGEX } from '../helpers';

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

      expect(response.status).toBe(201);
      expect(response.body.id).toMatch(UUID_REGEX);
      expect(response.body.status).toBe('Recebido');
      expect(response.body.customerName).toBe('Maria');
      expect(response.body.paymentMethod).toBe('Dinheiro');
      expect(response.body.paymentStatus).toBe('Aguardando no caixa');
      expect(response.body.items.length).toBe(1);
      expect(response.body.total).toBe(85.8);
    });

    test('soma os adicionais de prato no preço (Carbonara + Bacon crocante)', async () => {
      const response = await createOrder('Spaghetti Carbonara', { paymentMethod: 'PIX' }, { options: ['Bacon crocante'] });

      expect(response.status).toBe(201);
      expect(response.body.items[0].unitPrice).toBe(47.9);
      expect(response.body.paymentMethod).toBe('PIX');
    });

    test('aplica preço de taça para vinho', async () => {
      const response = await createOrder('Chianti Classico', {}, { options: ['Taça de vinho'] });
      expect(response.status).toBe(201);
      expect(response.body.items[0].unitPrice).toBe(18);
    });

    test('aplica preço de lata e adicionais para refrigerante', async () => {
      const response = await createOrder('Coca-Cola 600ml', {}, { options: ['Lata 350 ml', 'Copo com gelo', 'Com limão'] });
      expect(response.status).toBe(201);
      expect(response.body.items[0].unitPrice).toBe(10);
    });

    test('soma os adicionais de sobremesa', async () => {
      const response = await createOrder('Tiramisu', {}, { options: ['Chantilly'] });
      expect(response.status).toBe(201);
      expect(response.body.items[0].unitPrice).toBe(24.9);
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
        expect(response.status, `${productName} + ${option} deveria ser rejeitado`).toBe(400);
      }
    });

    test('retorna 400 quando faltam campos obrigatórios ou o corpo está vazio', async () => {
      expect((await api().post('/orders').send({})).status).toBe(400);
      expect((await api().post('/orders')).status).toBe(400);
      expect((await api().post('/orders').send({ customerName: 'Ana', tableNumber: 1, items: [] })).status).toBe(400);
    });

    test('retorna 400 para customerName que não é texto (antes gerava 500)', async () => {
      const response = await createOrder('Spaghetti Carbonara', { customerName: 42 });
      expect(response.status).toBe(400);
    });

    test('retorna 400 para mesa inválida', async () => {
      for (const tableNumber of [0, -3, 2.5, 'abc']) {
        const response = await createOrder('Spaghetti Carbonara', { tableNumber });
        expect(response.status, `mesa ${String(tableNumber)} deveria ser rejeitada`).toBe(400);
      }
    });

    test('retorna 400 para método de pagamento inválido', async () => {
      const response = await createOrder('Spaghetti Carbonara', { paymentMethod: 'Bitcoin' });
      expect(response.status).toBe(400);
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
        expect(response.status, `itens ${JSON.stringify(items)} deveriam ser rejeitados`).toBe(400);
        expect(response.body.message).toBeTruthy();
      }
    });

    test('retorna 400 para produto indisponível', async () => {
      const product = await createProduct({ isAvailable: false });
      const response = await api().post('/orders').send({
        customerName: 'Ana',
        tableNumber: 2,
        items: [{ productId: product.body.id }]
      });
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/indisponível/);
    });
  });

  describe('GET /orders e GET /orders/:id', () => {
    test('lista os pedidos (200)', async () => {
      await createOrder('Caprese');
      const response = await api().get('/orders');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBeTruthy();
      expect(response.body.length >= 1).toBeTruthy();
    });

    test('consulta um pedido pelo id (200)', async () => {
      const created = await createOrder('Arancini');
      const response = await api().get(`/orders/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(created.body.id);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      expect((await api().get(`/orders/${UNKNOWN_ID}`)).status).toBe(404);
      expect((await api().get('/orders/123')).status).toBe(400);
    });
  });

  describe('PUT /orders/:id', () => {
    test('atualiza cliente, mesa e pagamento (200) mantendo os itens', async () => {
      const created = await createOrder('Penne al Pomodoro');
      const response = await api().put(`/orders/${created.body.id}`).send({ customerName: 'João', tableNumber: 9, paymentMethod: 'Cartão' });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(created.body.id);
      expect(response.body.customerName).toBe('João');
      expect(response.body.tableNumber).toBe(9);
      expect(response.body.paymentMethod).toBe('Cartão');
      expect(response.body.items).toHaveLength(1);
      expect(response.body.total).toBe(created.body.total);
    });

    test('substitui os itens e recalcula o total no servidor', async () => {
      const created = await createOrder('Spaghetti Carbonara');
      const tiramisu = await findSeedProduct('Tiramisu');
      const response = await api().put(`/orders/${created.body.id}`).send({
        items: [{ productId: tiramisu.id, quantity: 2, options: ['Chantilly'] }]
      });

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].name).toBe('Tiramisu');
      expect(response.body.total).toBe(49.8);

      const stored = await api().get(`/orders/${created.body.id}`);
      expect(stored.body.total).toBe(49.8);
    });

    test('retorna 409 quando o pedido já saiu do status Recebido', async () => {
      const created = await createOrder('Caprese');
      await api().patch(`/orders/${created.body.id}/status`).send({ status: 'Preparando' });

      const response = await api().put(`/orders/${created.body.id}`).send({ tableNumber: 3 });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/Recebido/);
    });

    test('retorna 400 sem campos, com dados inválidos ou itens inválidos', async () => {
      const created = await createOrder('Arancini');
      expect((await api().put(`/orders/${created.body.id}`).send({})).status).toBe(400);
      expect((await api().put(`/orders/${created.body.id}`).send({ tableNumber: 0 })).status).toBe(400);
      expect((await api().put(`/orders/${created.body.id}`).send({ paymentMethod: 'Bitcoin' })).status).toBe(400);
      expect((await api().put(`/orders/${created.body.id}`).send({ items: [] })).status).toBe(400);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      expect((await api().put(`/orders/${UNKNOWN_ID}`).send({ tableNumber: 2 })).status).toBe(404);
      expect((await api().put('/orders/abc').send({ tableNumber: 2 })).status).toBe(400);
    });
  });

  describe('PATCH /orders/:id/status', () => {
    test('atualiza o status (200)', async () => {
      const created = await createOrder('Lasanha à Bolonhesa');
      const response = await api().patch(`/orders/${created.body.id}/status`).send({ status: 'Preparando' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('Preparando');
    });

    test('retorna 400 para status inválido ou ausente', async () => {
      const created = await createOrder('Caponata');
      expect((await api().patch(`/orders/${created.body.id}/status`).send({ status: 'Cancelado' })).status).toBe(400);
      expect((await api().patch(`/orders/${created.body.id}/status`)).status).toBe(400);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      expect((await api().patch(`/orders/${UNKNOWN_ID}/status`).send({ status: 'Pronto' })).status).toBe(404);
      expect((await api().patch('/orders/abc/status').send({ status: 'Pronto' })).status).toBe(400);
    });
  });

  describe('DELETE /orders/:id', () => {
    test('remove o pedido (204) e depois retorna 404', async () => {
      const created = await createOrder('Tiramisu');

      expect((await api().delete(`/orders/${created.body.id}`)).status).toBe(204);
      expect((await api().get(`/orders/${created.body.id}`)).status).toBe(404);
    });

    test('retorna 404 para id inexistente e 400 para id inválido', async () => {
      expect((await api().delete(`/orders/${UNKNOWN_ID}`)).status).toBe(404);
      expect((await api().delete('/orders/abc')).status).toBe(400);
    });
  });

  describe('Cozinha', () => {
    test('GET /orders/kitchen lista apenas pedidos não entregues', async () => {
      const delivered = await createOrder('Bruschetta Clássica');
      await api().patch(`/orders/${delivered.body.id}/status`).send({ status: 'Entregue' });
      const pending = await createOrder('Bruschetta Clássica');

      for (const path of ['/orders/kitchen', '/kitchen']) {
        const response = await api().get(path);
        expect(response.status).toBe(200);
        const ids = response.body.map((order: { id: string }) => order.id);
        expect(ids.includes(pending.body.id)).toBeTruthy();
        expect(!ids.includes(delivered.body.id)).toBeTruthy();
        expect(response.body.every((order: { status: string }) => order.status !== 'Entregue')).toBeTruthy();
      }
    });

    test('GET /orders/table/:tableNumber lista os pedidos da mesa', async () => {
      const created = await createOrder('Caprese', { tableNumber: 42 });
      const response = await api().get('/orders/table/42');

      expect(response.status).toBe(200);
      expect(response.body.some((order: { id: string }) => order.id === created.body.id)).toBeTruthy();
      expect(response.body.every((order: { tableNumber: number }) => order.tableNumber === 42)).toBeTruthy();
    });

    test('GET /orders/table/:tableNumber retorna 400 para mesa inválida', async () => {
      for (const table of ['abc', '0', '5.5', '-1']) {
        const response = await api().get(`/orders/table/${table}`);
        expect(response.status, `mesa ${table} deveria ser rejeitada`).toBe(400);
      }
    });
  });
});
