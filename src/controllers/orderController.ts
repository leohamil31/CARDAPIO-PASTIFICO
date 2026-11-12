import { Request, Response } from 'express';
import { orderRepository } from '../repositories/orderRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getIdParam } from '../utils/params';
import { isValidUuid } from '../utils/uuid';
import { OrderStatus, PaymentMethod } from '../models/Order';

const isRequestBody = (body: unknown): body is Record<string, unknown> =>
  body !== null && typeof body === 'object' && !Array.isArray(body);

const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  value === 'PIX' || value === 'Cartão' || value === 'Dinheiro';

const isOrderStatus = (value: unknown): value is OrderStatus =>
  value === 'Recebido' || value === 'Preparando' || value === 'Pronto' || value === 'Entregue';

const invalidOrderId = (id: string, res: Response): boolean => {
  if (isValidUuid(id)) return false;
  res.status(400).json({ message: 'O id do pedido deve ser um UUID válido.' });
  return true;
};

export const listOrders = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await orderRepository.findAll());
});

export const storeOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!isRequestBody(req.body)) {
    res.status(400).json({ message: 'O corpo da requisição deve ser um objeto JSON.' });
    return;
  }

  const { customerName, tableNumber, items, paymentMethod = 'Dinheiro' } = req.body;

  if (typeof customerName !== 'string' || !customerName.trim()
    || tableNumber === undefined || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: 'Nome do cliente, número da mesa e itens são obrigatórios.' });
    return;
  }

  const parsedTableNumber = typeof tableNumber === 'number'
    ? tableNumber
    : typeof tableNumber === 'string' && tableNumber.trim()
      ? Number(tableNumber)
      : Number.NaN;
  if (!Number.isInteger(parsedTableNumber) || parsedTableNumber < 1) {
    res.status(400).json({ message: 'Número da mesa inválido.' });
    return;
  }

  if (!isPaymentMethod(paymentMethod)) {
    res.status(400).json({ message: 'Método de pagamento inválido.' });
    return;
  }

  const validItems = items.every((item) => {
    if (!isRequestBody(item)
      || typeof item.productId !== 'string'
      || !isValidUuid(item.productId)
      || (item.quantity !== undefined && (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1))
      || (item.options !== undefined && (!Array.isArray(item.options) || !item.options.every((option) => typeof option === 'string')))) {
      return false;
    }
    return true;
  });
  if (!validItems) {
    res.status(400).json({ message: 'Um ou mais itens do pedido são inválidos.' });
    return;
  }

  const order = await orderRepository.create(customerName.trim(), parsedTableNumber, items, paymentMethod);
  res.status(201).json(order);
});

export const showOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidOrderId(id, res)) return;

  const order = await orderRepository.findById(id);
  if (!order) {
    res.status(404).json({ message: 'Pedido não encontrado.' });
    return;
  }
  res.status(200).json(order);
});

export const updateOrderStatusController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidOrderId(id, res)) return;
  if (!isRequestBody(req.body)) {
    res.status(400).json({ message: 'O corpo da requisição deve ser um objeto JSON.' });
    return;
  }

  const { status } = req.body;

  if (!isOrderStatus(status)) {
    res.status(400).json({ message: 'Status do pedido inválido.' });
    return;
  }

  const order = await orderRepository.updateStatus(id, status);

  if (!order) {
    res.status(404).json({ message: 'Pedido não encontrado.' });
    return;
  }

  res.status(200).json(order);
});

export const destroyOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidOrderId(id, res)) return;

  const removed = await orderRepository.remove(id);

  if (!removed) {
    res.status(404).json({ message: 'Pedido não encontrado.' });
    return;
  }

  res.status(204).send();
});
