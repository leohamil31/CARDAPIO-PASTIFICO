import { Request, Response } from 'express';
import { CategoryService } from '../services/CategoryService';
import { CategoryChanges } from '../repositories/categoryRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getIdParam } from '../utils/params';
import { getBody, optionalString, requireString } from '../utils/validation';

/**
 * Controller de categorias: lê e valida o formato da requisição HTTP,
 * chama o `CategoryService` e devolve o código de status adequado.
 */
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  index = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.list());
  });

  show = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.getById(getIdParam(req.params.id)));
  });

  store = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = getBody(req);
    const category = await this.service.create({
      name: requireString(body.name, 'name', 100),
      description: requireString(body.description, 'description', 500)
    });
    res.status(201).json(category);
  });

  update = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = getBody(req);
    const changes: CategoryChanges = {};
    const name = optionalString(body.name, 'name', 100);
    const description = optionalString(body.description, 'description', 500);
    if (name !== undefined) changes.name = name;
    if (description !== undefined) changes.description = description;

    res.status(200).json(await this.service.update(getIdParam(req.params.id), changes));
  });

  destroy = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(getIdParam(req.params.id));
    res.status(204).send();
  });
}
