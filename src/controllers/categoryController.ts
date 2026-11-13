import { Request, Response } from 'express';
import { categoryRepository } from '../repositories/categoryRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { HttpError } from '../middlewares/errorHandler';
import { getIdParam } from '../utils/params';
import { getBody, optionalString, requireString } from '../utils/validation';

export const listCategories = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await categoryRepository.findAll());
});

export const showCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const category = await categoryRepository.findById(getIdParam(req.params.id));

  if (!category) throw new HttpError(404, 'Categoria não encontrada.');

  res.status(200).json(category);
});

export const storeCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const body = getBody(req);
  const name = requireString(body.name, 'name', 100);
  const description = requireString(body.description, 'description', 500);

  const category = await categoryRepository.create(name, description);
  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const body = getBody(req);
  const name = optionalString(body.name, 'name', 100);
  const description = optionalString(body.description, 'description', 500);

  if (name === undefined && description === undefined) {
    throw new HttpError(400, 'Informe ao menos um campo para atualizar (name ou description).');
  }

  const changes: Partial<{ name: string; description: string }> = {};
  if (name !== undefined) changes.name = name;
  if (description !== undefined) changes.description = description;

  const category = await categoryRepository.update(getIdParam(req.params.id), changes);

  if (!category) throw new HttpError(404, 'Categoria não encontrada.');

  res.status(200).json(category);
});

export const destroyCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const removed = await categoryRepository.remove(getIdParam(req.params.id));

  if (!removed) throw new HttpError(404, 'Categoria não encontrada.');

  res.status(204).send();
});
