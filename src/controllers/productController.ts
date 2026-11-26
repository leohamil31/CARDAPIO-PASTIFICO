import { Request, Response } from 'express';
import { ProductService } from '../services/ProductService';
import { ProductChanges } from '../repositories/productRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { HttpError } from '../errors/HttpError';
import { getIdParam } from '../utils/params';
import { getBody, optionalBoolean, optionalImageUrl, optionalString, requireImageUrl, requirePrice, requireString, requireUuid } from '../utils/validation';

const REQUIRED_FIELDS = ['name', 'description', 'price', 'image', 'categoryId'];

/** Controller de produtos: valida a entrada HTTP e delega as regras ao `ProductService`. */
export class ProductController {
  constructor(private readonly service: ProductService) {}

  index = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.list());
  });

  show = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.getById(getIdParam(req.params.id)));
  });

  store = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = getBody(req);

    const missing = REQUIRED_FIELDS.filter((field) => body[field] === undefined || body[field] === '');
    if (missing.length > 0) {
      throw new HttpError(400, `Campos obrigatórios ausentes: ${missing.join(', ')}.`);
    }

    const product = await this.service.create({
      name: requireString(body.name, 'name', 120),
      description: requireString(body.description, 'description', 1000),
      price: requirePrice(body.price),
      image: requireImageUrl(body.image),
      isAvailable: optionalBoolean(body.isAvailable, 'isAvailable') ?? true,
      categoryId: requireUuid(body.categoryId, 'categoryId')
    });
    res.status(201).json(product);
  });

  update = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = getBody(req);

    // Lista branca de campos: impede alterar `id`, `createdAt` ou enviar colunas inexistentes.
    const changes: ProductChanges = {};
    const name = optionalString(body.name, 'name', 120);
    const description = optionalString(body.description, 'description', 1000);
    const image = optionalImageUrl(body.image);
    const isAvailable = optionalBoolean(body.isAvailable, 'isAvailable');

    if (name !== undefined) changes.name = name;
    if (description !== undefined) changes.description = description;
    if (image !== undefined) changes.image = image;
    if (isAvailable !== undefined) changes.isAvailable = isAvailable;
    if (body.price !== undefined) changes.price = requirePrice(body.price);
    if (body.categoryId !== undefined) changes.categoryId = requireUuid(body.categoryId, 'categoryId');

    res.status(200).json(await this.service.update(getIdParam(req.params.id), changes));
  });

  destroy = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(getIdParam(req.params.id));
    res.status(204).send();
  });
}
