import { Request, Response } from 'express';
import { OrderService } from '../services/OrderService';
import { asyncHandler } from '../middlewares/asyncHandler';
import { HttpError } from '../errors/HttpError';
import { getIdParam } from '../utils/params';

/** Controller do painel da cozinha (pedidos em aberto e pedidos por mesa). */
export class KitchenController {
  constructor(private readonly service: OrderService) {}

  openOrders = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.listForKitchen());
  });

  tableOrders = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const raw = getIdParam(req.params.tableNumber);

    // Aceita só inteiros positivos ("5"); rejeita "abc", "0", "-1" e "5.5".
    if (!/^\d+$/.test(raw)) throw new HttpError(400, 'Número da mesa é inválido.');

    res.status(200).json(await this.service.listByTable(Number(raw)));
  });
}
