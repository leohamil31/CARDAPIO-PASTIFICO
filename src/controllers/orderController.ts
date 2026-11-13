import { Request, Response } from 'express';
import { orderRepository, OrderItemInput } from '../repositories/orderRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { HttpError } from '../middlewares/errorHandler';
import { getIdParam } from '../utils/params';
import { getBody, requirePositiveInteger, requireString } from '../utils/validation';
import { OrderStatus, PaymentMethod } from '../models/Order';

const VALID_STATUSES: readonly OrderStatus[] = ['Recebido', 'Preparando', 'Pronto', 'Entregue'];
const VALID_PAYMENT_METHODS: readonly PaymentMethod[] = ['PIX', 'Cartão', 'Dinheiro'];
const MAX_ITEMS_PER_ORDER = 50;

const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === 'string' && (VALID_STATUSES as readonly string[]).includes(value);

const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  typeof value === 'string' && (VALID_PAYMENT_METHODS as readonly string[]).includes(value);

export const listOrders = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await orderRepository.findAll());
});

export const storeOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const body = getBody(req);
  const { items, paymentMethod = 'Dinheiro' } = body;

  if (body.customerName === undefined || body.tableNumber === undefined || items === undefined) {
    throw new HttpError(400, 'Nome do cliente, número da mesa e itens são obrigatórios.');
  }

  const customerName = requireString(body.customerName, 'customerName', 100);
  const tableNumber = requirePositiveInteger(body.tableNumber, 'tableNumber');

  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'O pedido deve ter ao menos um item (items deve ser uma lista).');
  }

  if (items.length > MAX_ITEMS_PER_ORDER) {
    throw new HttpError(400, `O pedido pode ter no máximo ${MAX_ITEMS_PER_ORDER} itens.`);
  }

  if (!isPaymentMethod(paymentMethod)) {
    throw new HttpError(400, `Método de pagamento inválido. Use: ${VALID_PAYMENT_METHODS.join(', ')}.`);
  }

  // Erros de validação dos itens chegam como HttpError(400) do repository;
  // falhas inesperadas (ex.: banco fora do ar) seguem para o errorHandler como 500.
  const order = await orderRepository.create(customerName, tableNumber, items as OrderItemInput[], paymentMethod);
  res.status(201).json(order);
});

export const showOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const order = await orderRepository.findById(getIdParam(req.params.id));

  if (!order) throw new HttpError(404, 'Pedido não encontrado.');

  res.status(200).json(order);
});

export const updateOrderStatusController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { status } = getBody(req);

  if (!isOrderStatus(status)) {
    throw new HttpError(400, `Status do pedido inválido. Use: ${VALID_STATUSES.join(', ')}.`);
  }

  const order = await orderRepository.updateStatus(getIdParam(req.params.id), status);

  if (!order) throw new HttpError(404, 'Pedido não encontrado.');

  res.status(200).json(order);
});

export const destroyOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const removed = await orderRepository.remove(getIdParam(req.params.id));

  if (!removed) throw new HttpError(404, 'Pedido não encontrado.');

  res.status(204).send();
});
