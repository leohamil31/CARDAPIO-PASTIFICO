import { Request, Response } from 'express';
import { productRepository, ProductChanges } from '../repositories/productRepository';
import { categoryRepository } from '../repositories/categoryRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { HttpError } from '../middlewares/errorHandler';
import { getIdParam } from '../utils/params';
import { getBody, optionalBoolean, optionalString, requirePrice, requireString, requireUuid } from '../utils/validation';

/** Garante que a categoria informada existe (evita produto "órfão" ou erro de FK no banco). */
const ensureCategoryExists = async (categoryId: string): Promise<void> => {
  const category = await categoryRepository.findById(categoryId);
  if (!category) throw new HttpError(400, 'A categoria informada (categoryId) não existe.');
};

export const listProducts = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await productRepository.findAll());
});

export const showProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const product = await productRepository.findById(getIdParam(req.params.id));

  if (!product) throw new HttpError(404, 'Produto não encontrado.');

  res.status(200).json(product);
});

export const storeProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const body = getBody(req);

  const missing = ['name', 'description', 'price', 'image', 'categoryId'].filter((field) => body[field] === undefined || body[field] === '');
  if (missing.length > 0) {
    throw new HttpError(400, `Campos obrigatórios ausentes: ${missing.join(', ')}.`);
  }

  const input = {
    name: requireString(body.name, 'name', 120),
    description: requireString(body.description, 'description', 1000),
    price: requirePrice(body.price),
    image: requireString(body.image, 'image', 2048),
    isAvailable: optionalBoolean(body.isAvailable, 'isAvailable') ?? true,
    categoryId: requireUuid(body.categoryId, 'categoryId')
  };

  await ensureCategoryExists(input.categoryId);

  const product = await productRepository.create(input);
  res.status(201).json(product);
});

export const updateProductController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const body = getBody(req);

  // Lista branca de campos: impede que o cliente altere `id`, `createdAt`
  // ou envie colunas inexistentes (que causariam erro 500 no Supabase).
  const changes: ProductChanges = {};
  const name = optionalString(body.name, 'name', 120);
  const description = optionalString(body.description, 'description', 1000);
  const image = optionalString(body.image, 'image', 2048);
  const isAvailable = optionalBoolean(body.isAvailable, 'isAvailable');

  if (name !== undefined) changes.name = name;
  if (description !== undefined) changes.description = description;
  if (image !== undefined) changes.image = image;
  if (isAvailable !== undefined) changes.isAvailable = isAvailable;
  if (body.price !== undefined) changes.price = requirePrice(body.price);
  if (body.categoryId !== undefined) {
    changes.categoryId = requireUuid(body.categoryId, 'categoryId');
    await ensureCategoryExists(changes.categoryId);
  }

  if (Object.keys(changes).length === 0) {
    throw new HttpError(400, 'Informe ao menos um campo para atualizar (name, description, price, image, isAvailable ou categoryId).');
  }

  const product = await productRepository.update(getIdParam(req.params.id), changes);

  if (!product) throw new HttpError(404, 'Produto não encontrado.');

  res.status(200).json(product);
});

export const destroyProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const removed = await productRepository.remove(getIdParam(req.params.id));

  if (!removed) throw new HttpError(404, 'Produto não encontrado.');

  res.status(204).send();
});
