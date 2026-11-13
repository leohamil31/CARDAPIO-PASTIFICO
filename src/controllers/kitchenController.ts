import { Request, Response } from 'express';
import { orderRepository } from '../repositories/orderRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { HttpError } from '../middlewares/errorHandler';
import { getIdParam } from '../utils/params';

export const listKitchenOrders = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await orderRepository.findForKitchen());
});

export const listTableOrders = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const raw = getIdParam(req.params.tableNumber);
  const tableNumber = Number(raw);

  // Aceita só inteiros positivos ("5"); rejeita "abc", "0", "-1" e "5.5".
  if (!/^\d+$/.test(raw) || !Number.isInteger(tableNumber) || tableNumber < 1) {
    throw new HttpError(400, 'Número da mesa é inválido.');
  }

  res.status(200).json(await orderRepository.findByTable(tableNumber));
});
