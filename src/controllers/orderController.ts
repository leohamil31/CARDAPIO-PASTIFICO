import { Request, Response } from 'express';
import { OrderService, UpdateOrderInput } from '../services/OrderService';
import { asyncHandler } from '../middlewares/asyncHandler';
import { HttpError } from '../errors/HttpError';
import { getIdParam } from '../utils/params';
import { getBody, requirePositiveInteger, requireString } from '../utils/validation';

/** Controller de pedidos: valida a entrada HTTP e delega as regras ao `OrderService`. */
export class OrderController {
  constructor(private readonly service: OrderService) {}

  index = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.list());
  });

  show = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.getById(getIdParam(req.params.id)));
  });

  store = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = getBody(req);

    if (body.customerName === undefined || body.tableNumber === undefined || body.items === undefined) {
      throw new HttpError(400, 'Nome do cliente, número da mesa e itens são obrigatórios.');
    }

    const order = await this.service.create({
      customerName: requireString(body.customerName, 'customerName', 100),
      tableNumber: requirePositiveInteger(body.tableNumber, 'tableNumber'),
      items: body.items,
      paymentMethod: body.paymentMethod
    });
    res.status(201).json(order);
  });

  update = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = getBody(req);
    const input: UpdateOrderInput = {};

    if (body.customerName !== undefined) input.customerName = requireString(body.customerName, 'customerName', 100);
    if (body.tableNumber !== undefined) input.tableNumber = requirePositiveInteger(body.tableNumber, 'tableNumber');
    if (body.paymentMethod !== undefined) input.paymentMethod = body.paymentMethod;
    if (body.items !== undefined) input.items = body.items;

    res.status(200).json(await this.service.update(getIdParam(req.params.id), input));
  });

  updateStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { status } = getBody(req);
    res.status(200).json(await this.service.updateStatus(getIdParam(req.params.id), status));
  });

  destroy = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(getIdParam(req.params.id));
    res.status(204).send();
  });
}
