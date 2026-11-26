import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderService } from '../../../src/services/OrderService';
import { PricingService } from '../../../src/services/PricingService';
import { makeOrder, makeProduct, mockOrderRepository, mockProductRepository, ORDER_ID, OTHER_ID, PRODUCT_ID } from '../mocks';

describe('OrderService (unitário)', () => {
  let orders: ReturnType<typeof mockOrderRepository>;
  let products: ReturnType<typeof mockProductRepository>;
  let service: OrderService;

  beforeEach(() => {
    orders = mockOrderRepository();
    products = mockProductRepository();
    service = new OrderService(orders, products, new PricingService());
    orders.create.mockImplementation(async (order) => order);
    products.findById.mockResolvedValue(makeProduct());
  });

  describe('create', () => {
    it('cria o pedido com status Recebido, pagamento padrão Dinheiro e total calculado', async () => {
      const order = await service.create({
        customerName: 'Maria',
        tableNumber: 5,
        items: [{ productId: PRODUCT_ID, quantity: 2, options: ['Bacon crocante'] }]
      });

      expect(order.status).toBe('Recebido');
      expect(order.paymentMethod).toBe('Dinheiro');
      expect(order.paymentStatus).toBe('Aguardando no caixa');
      expect(order.items[0]).toMatchObject({ unitPrice: 47.9, subtotal: 95.8, quantity: 2 });
      expect(order.total).toBe(95.8);
      expect(orders.create).toHaveBeenCalledOnce();
    });

    it('usa o PricingService para calcular o preço (mock)', async () => {
      const pricing = new PricingService();
      const spy = vi.spyOn(pricing, 'calculateUnitPrice').mockReturnValue(10);
      service = new OrderService(orders, products, pricing);

      const order = await service.create({ customerName: 'Ana', tableNumber: 1, items: [{ productId: PRODUCT_ID, quantity: 3 }] });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: PRODUCT_ID }), []);
      expect(order.total).toBe(30);
    });

    it('aceita forma de pagamento válida e rejeita inválida (400)', async () => {
      const pix = await service.create({ customerName: 'Ana', tableNumber: 1, items: [{ productId: PRODUCT_ID }], paymentMethod: 'PIX' });
      expect(pix.paymentMethod).toBe('PIX');

      await expect(service.create({ customerName: 'Ana', tableNumber: 1, items: [{ productId: PRODUCT_ID }], paymentMethod: 'Bitcoin' }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('exige de 1 a 50 itens', async () => {
      await expect(service.create({ customerName: 'A', tableNumber: 1, items: [] })).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.create({ customerName: 'A', tableNumber: 1, items: 'texto' })).rejects.toMatchObject({ statusCode: 400 });

      const tooMany = Array.from({ length: OrderService.MAX_ITEMS_PER_ORDER + 1 }, () => ({ productId: PRODUCT_ID }));
      await expect(service.create({ customerName: 'A', tableNumber: 1, items: tooMany })).rejects.toMatchObject({ statusCode: 400 });
      expect(orders.create).not.toHaveBeenCalled();
    });

    it.each([0, 100, 1.5, 'abc'])('rejeita quantidade %s (400)', async (quantity: unknown) => {
      await expect(service.create({ customerName: 'A', tableNumber: 1, items: [{ productId: PRODUCT_ID, quantity }] }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejeita item que não é objeto, productId inválido e options que não é lista', async () => {
      const cases: unknown[] = [[null], ['texto'], [{ productId: 'abc' }], [{ productId: PRODUCT_ID, options: 'Bacon' }]];
      for (const items of cases) {
        await expect(service.create({ customerName: 'A', tableNumber: 1, items })).rejects.toMatchObject({ statusCode: 400 });
      }
    });

    it('regra de negócio: não aceita produto inexistente ou indisponível', async () => {
      products.findById.mockResolvedValueOnce(undefined);
      await expect(service.create({ customerName: 'A', tableNumber: 1, items: [{ productId: OTHER_ID }] })).rejects.toMatchObject({ statusCode: 400 });

      products.findById.mockResolvedValueOnce(makeProduct({ isAvailable: false }));
      await expect(service.create({ customerName: 'A', tableNumber: 1, items: [{ productId: PRODUCT_ID }] }))
        .rejects.toThrowError(/indisponível/);
    });
  });

  describe('update (PUT)', () => {
    it('exige ao menos um campo (400)', async () => {
      await expect(service.update(ORDER_ID, {})).rejects.toMatchObject({ statusCode: 400 });
      expect(orders.findById).not.toHaveBeenCalled();
    });

    it('retorna 404 para pedido inexistente', async () => {
      orders.findById.mockResolvedValue(undefined);
      await expect(service.update(ORDER_ID, { tableNumber: 2 })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('regra de negócio: só altera pedidos com status Recebido (409)', async () => {
      orders.findById.mockResolvedValue(makeOrder({ status: 'Preparando' }));
      await expect(service.update(ORDER_ID, { tableNumber: 2 })).rejects.toMatchObject({ statusCode: 409 });
      expect(orders.update).not.toHaveBeenCalled();
    });

    it('atualiza só os campos enviados', async () => {
      orders.findById.mockResolvedValue(makeOrder());
      orders.update.mockResolvedValue(makeOrder({ tableNumber: 8, paymentMethod: 'Cartão' }));

      await service.update(ORDER_ID, { tableNumber: 8, paymentMethod: 'Cartão' });

      expect(orders.update).toHaveBeenCalledWith(ORDER_ID, { tableNumber: 8, paymentMethod: 'Cartão' });
    });

    it('recalcula itens e total quando items é enviado', async () => {
      orders.findById.mockResolvedValue(makeOrder());
      orders.update.mockImplementation(async (_id, changes) => makeOrder(changes));

      const updated = await service.update(ORDER_ID, { items: [{ productId: PRODUCT_ID, quantity: 2 }] });

      expect(updated.total).toBe(85.8);
      expect(orders.update).toHaveBeenCalledWith(ORDER_ID, expect.objectContaining({ total: 85.8 }));
    });

    it('rejeita forma de pagamento inválida e retorna 404 se o pedido sumir ao gravar', async () => {
      await expect(service.update(ORDER_ID, { paymentMethod: 'Cheque' })).rejects.toMatchObject({ statusCode: 400 });

      orders.findById.mockResolvedValue(makeOrder());
      orders.update.mockResolvedValue(undefined);
      await expect(service.update(ORDER_ID, { customerName: 'Ana' })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('status, consultas e remoção', () => {
    it('atualiza para um status válido', async () => {
      orders.updateStatus.mockResolvedValue(makeOrder({ status: 'Pronto' }));
      await expect(service.updateStatus(ORDER_ID, 'Pronto')).resolves.toMatchObject({ status: 'Pronto' });
    });

    it('rejeita status inválido (400) e pedido inexistente (404)', async () => {
      await expect(service.updateStatus(ORDER_ID, 'Cancelado')).rejects.toMatchObject({ statusCode: 400 });
      expect(orders.updateStatus).not.toHaveBeenCalled();

      orders.updateStatus.mockResolvedValue(undefined);
      await expect(service.updateStatus(ORDER_ID, 'Pronto')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lista, busca por id e retorna 404 quando não encontra', async () => {
      orders.findAll.mockResolvedValue([makeOrder()]);
      await expect(service.list()).resolves.toHaveLength(1);

      orders.findById.mockResolvedValueOnce(makeOrder());
      await expect(service.getById(ORDER_ID)).resolves.toMatchObject({ id: ORDER_ID });

      orders.findById.mockResolvedValueOnce(undefined);
      await expect(service.getById(ORDER_ID)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('cozinha vê apenas pedidos não entregues', async () => {
      orders.findAll.mockResolvedValue([makeOrder({ id: 'a', status: 'Entregue' }), makeOrder({ id: 'b', status: 'Pronto' })]);
      const result = await service.listForKitchen();
      expect(result.map((order) => order.id)).toEqual(['b']);
    });

    it('filtra pedidos por mesa e valida o número da mesa', async () => {
      orders.findAll.mockResolvedValue([makeOrder({ id: 'a', tableNumber: 3 }), makeOrder({ id: 'b', tableNumber: 4 })]);
      await expect(service.listByTable(3)).resolves.toHaveLength(1);
      await expect(service.listByTable(0)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('remove o pedido ou retorna 404', async () => {
      orders.remove.mockResolvedValueOnce(true);
      await expect(service.remove(ORDER_ID)).resolves.toBeUndefined();

      orders.remove.mockResolvedValueOnce(false);
      await expect(service.remove(ORDER_ID)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('calculateTotal soma os subtotais com arredondamento', () => {
      expect(OrderService.calculateTotal([{ subtotal: 0.1 }, { subtotal: 0.2 }])).toBe(0.3);
    });
  });
});
