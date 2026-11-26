import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseFake } from '../supabaseFake';
import { OrderRepository } from '../../../src/repositories/orderRepository';
import { makeOrder, ORDER_ID, OTHER_ID, PRODUCT_ID } from '../mocks';

vi.mock('../../../src/config/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  requireSupabaseClient: () => globalThis.pastificoSupabaseFake.client
}));

const row = {
  id: ORDER_ID,
  customer_name: 'Maria',
  table_number: 5,
  status: 'Pronto',
  total: '42.90',
  created_at: '2026-01-01T00:00:00.000Z',
  payment_method: null,
  payment_status: 'Pago',
  order_items: [
    { id: OTHER_ID, product_id: PRODUCT_ID, name: 'Spaghetti Carbonara', quantity: 1, unit_price: '42.90', subtotal: '42.90', options: null }
  ]
};
const dbError = { code: 'XX000', message: 'falha no banco' };

describe('OrderRepository (modo Supabase, cliente mockado)', () => {
  const repository = new OrderRepository();

  beforeEach(() => supabaseFake.reset());

  it('findAll traz os itens (join) e aplica valores padrão de pagamento', async () => {
    supabaseFake.enqueue('orders', { data: [row] }, { data: null }, { error: dbError });

    const [order] = await repository.findAll();
    expect(order).toMatchObject({ customerName: 'Maria', tableNumber: 5, total: 42.9, paymentMethod: 'Dinheiro', paymentStatus: 'Pago' });
    expect(order.items[0]).toMatchObject({ productId: PRODUCT_ID, unitPrice: 42.9, options: [] });
    expect(supabaseFake.argsOf('orders', 'select')).toEqual(['*, order_items(*)']);

    await expect(repository.findAll()).resolves.toEqual([]);
    await expect(repository.findAll()).rejects.toEqual(dbError);
  });

  it('findById trata UUID inválido, pedido sem itens, não encontrado e erro', async () => {
    await expect(repository.findById('x')).resolves.toBeUndefined();

    supabaseFake.enqueue('orders', { data: { ...row, order_items: undefined, payment_method: 'PIX', payment_status: null } }, { data: null }, { error: dbError });
    await expect(repository.findById(ORDER_ID)).resolves.toMatchObject({ items: [], paymentMethod: 'PIX', paymentStatus: 'Aguardando no caixa' });
    await expect(repository.findById(ORDER_ID)).resolves.toBeUndefined();
    await expect(repository.findById(ORDER_ID)).rejects.toEqual(dbError);
  });

  it('existsWithProduct consulta order_items pelo produto', async () => {
    await expect(repository.existsWithProduct('x')).resolves.toBe(false);
    supabaseFake.enqueue('order_items', { count: 1 }, { count: 0 }, { error: dbError });
    await expect(repository.existsWithProduct(PRODUCT_ID)).resolves.toBe(true);
    await expect(repository.existsWithProduct(PRODUCT_ID)).resolves.toBe(false);
    await expect(repository.existsWithProduct(PRODUCT_ID)).rejects.toEqual(dbError);
  });

  it('create grava o pedido e depois os itens', async () => {
    supabaseFake.enqueue('orders', { data: { created_at: '2026-02-02T00:00:00.000Z' } });
    supabaseFake.enqueue('order_items', {});

    const created = await repository.create(makeOrder());

    expect(created.createdAt).toBe('2026-02-02T00:00:00.000Z');
    const [items] = supabaseFake.argsOf('order_items', 'insert') as [Array<Record<string, unknown>>];
    expect(items[0]).toMatchObject({ order_id: ORDER_ID, product_id: PRODUCT_ID, unit_price: 42.9 });
  });

  it('create desfaz o pedido se a gravação dos itens falhar', async () => {
    supabaseFake.enqueue('orders', { data: {} }, {});
    supabaseFake.enqueue('order_items', { error: dbError });

    await expect(repository.create(makeOrder())).rejects.toEqual(dbError);
    expect(supabaseFake.methods('orders')).toContain('delete');
  });

  it('create propaga erro ao gravar o pedido', async () => {
    supabaseFake.enqueue('orders', { error: dbError });
    await expect(repository.create(makeOrder())).rejects.toEqual(dbError);
    expect(supabaseFake.methods('order_items')).toHaveLength(0);
  });

  it('update altera o pedido, substitui os itens e devolve o pedido atualizado', async () => {
    supabaseFake.enqueue('orders', { data: { id: ORDER_ID } }, { data: { ...row, table_number: 9 } });
    supabaseFake.enqueue('order_items', {}, {});

    const updated = await repository.update(ORDER_ID, { customerName: 'Ana', tableNumber: 9, paymentMethod: 'PIX', total: 10, items: makeOrder().items });

    expect(updated?.tableNumber).toBe(9);
    expect(supabaseFake.argsOf('orders', 'update')).toEqual([{ customer_name: 'Ana', table_number: 9, payment_method: 'PIX', total: 10 }]);
    expect(supabaseFake.methods('order_items')).toEqual(['from', 'delete', 'eq', 'from', 'insert']);
  });

  it('update trata id inválido, pedido inexistente e erros', async () => {
    await expect(repository.update('x', { tableNumber: 1 })).resolves.toBeUndefined();

    supabaseFake.enqueue('orders', { data: null }, { error: dbError }, { data: { id: ORDER_ID } }, { data: { id: ORDER_ID } });
    supabaseFake.enqueue('order_items', { error: dbError }, {}, { error: dbError });

    await expect(repository.update(ORDER_ID, { tableNumber: 1 })).resolves.toBeUndefined();
    await expect(repository.update(ORDER_ID, { tableNumber: 1 })).rejects.toEqual(dbError);
    await expect(repository.update(ORDER_ID, { items: [] })).rejects.toEqual(dbError);
    await expect(repository.update(ORDER_ID, { items: [] })).rejects.toEqual(dbError);
  });

  it('updateStatus atualiza o status', async () => {
    await expect(repository.updateStatus('x', 'Pronto')).resolves.toBeUndefined();
    supabaseFake.enqueue('orders', { data: row }, { data: null }, { error: dbError });
    await expect(repository.updateStatus(ORDER_ID, 'Pronto')).resolves.toMatchObject({ status: 'Pronto' });
    expect(supabaseFake.argsOf('orders', 'update')).toEqual([{ status: 'Pronto' }]);
    await expect(repository.updateStatus(ORDER_ID, 'Pronto')).resolves.toBeUndefined();
    await expect(repository.updateStatus(ORDER_ID, 'Pronto')).rejects.toEqual(dbError);
  });

  it('remove apaga o pedido (itens saem em cascata no banco)', async () => {
    await expect(repository.remove('x')).resolves.toBe(false);
    supabaseFake.enqueue('orders', { count: 1 }, { error: dbError });
    await expect(repository.remove(ORDER_ID)).resolves.toBe(true);
    await expect(repository.remove(ORDER_ID)).rejects.toEqual(dbError);
  });
});
