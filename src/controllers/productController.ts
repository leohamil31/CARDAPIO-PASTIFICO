import { Request, Response } from 'express';
import { productRepository } from '../repositories/productRepository';
import { categoryRepository } from '../repositories/categoryRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getIdParam } from '../utils/params';
import { isValidUuid } from '../utils/uuid';

const isRequestBody = (body: unknown): body is Record<string, unknown> =>
  body !== null && typeof body === 'object' && !Array.isArray(body);

const invalidProductId = (id: string, res: Response): boolean => {
  if (isValidUuid(id)) return false;
  res.status(400).json({ message: 'O id do produto deve ser um UUID válido.' });
  return true;
};

export const listProducts = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await productRepository.findAll());
});

export const showProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidProductId(id, res)) return;

  const product = await productRepository.findById(id);

  if (!product) {
    res.status(404).json({ message: 'Produto não encontrado.' });
    return;
  }

  res.status(200).json(product);
});

export const storeProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!isRequestBody(req.body)) {
    res.status(400).json({ message: 'O corpo da requisição deve ser um objeto JSON.' });
    return;
  }

  const { name, description, price, image, isAvailable, categoryId } = req.body;

  if (typeof name !== 'string' || !name.trim()
    || typeof description !== 'string' || !description.trim()
    || typeof image !== 'string' || !image.trim()
    || typeof categoryId !== 'string' || !categoryId
    || typeof isAvailable !== 'boolean'
    || price === undefined) {
    res.status(400).json({ message: 'Todos os campos do produto são obrigatórios.' });
    return;
  }

  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
    res.status(400).json({ message: 'O preço do produto é inválido.' });
    return;
  }

  if (!isValidUuid(categoryId)) {
    res.status(400).json({ message: 'O id da categoria deve ser um UUID válido.' });
    return;
  }
  if (!await categoryRepository.findById(categoryId)) {
    res.status(400).json({ message: 'A categoria informada não foi encontrada.' });
    return;
  }

  const product = await productRepository.create({
    name: name.trim(),
    description: description.trim(),
    price,
    image: image.trim(),
    isAvailable,
    categoryId
  });
  res.status(201).json(product);
});

export const updateProductController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidProductId(id, res)) return;
  if (!isRequestBody(req.body)) {
    res.status(400).json({ message: 'O corpo da requisição deve ser um objeto JSON.' });
    return;
  }

  const allowedFields = ['name', 'description', 'price', 'image', 'isAvailable', 'categoryId'];
  if (Object.keys(req.body).length === 0 || Object.keys(req.body).some((field) => !allowedFields.includes(field))) {
    res.status(400).json({ message: 'Informe campos válidos para atualizar o produto.' });
    return;
  }

  const changes: {
    name?: string;
    description?: string;
    price?: number;
    image?: string;
    isAvailable?: boolean;
    categoryId?: string;
  } = {};
  const { name, description, price, image, isAvailable, categoryId } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ message: 'O nome do produto deve ser um texto não vazio.' });
      return;
    }
    changes.name = name.trim();
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ message: 'A descrição do produto deve ser um texto não vazio.' });
      return;
    }
    changes.description = description.trim();
  }
  if (price !== undefined) {
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      res.status(400).json({ message: 'O preço do produto é inválido.' });
      return;
    }
    changes.price = price;
  }
  if (image !== undefined) {
    if (typeof image !== 'string' || !image.trim()) {
      res.status(400).json({ message: 'A imagem do produto deve ser um texto não vazio.' });
      return;
    }
    changes.image = image.trim();
  }
  if (isAvailable !== undefined) {
    if (typeof isAvailable !== 'boolean') {
      res.status(400).json({ message: 'A disponibilidade do produto deve ser booleana.' });
      return;
    }
    changes.isAvailable = isAvailable;
  }
  if (categoryId !== undefined) {
    if (typeof categoryId !== 'string' || !isValidUuid(categoryId)) {
      res.status(400).json({ message: 'O id da categoria deve ser um UUID válido.' });
      return;
    }
    if (!await categoryRepository.findById(categoryId)) {
      res.status(400).json({ message: 'A categoria informada não foi encontrada.' });
      return;
    }
    changes.categoryId = categoryId;
  }

  const product = await productRepository.update(id, changes);

  if (!product) {
    res.status(404).json({ message: 'Produto não encontrado.' });
    return;
  }

  res.status(200).json(product);
});

export const destroyProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidProductId(id, res)) return;

  const removed = await productRepository.remove(id);

  if (!removed) {
    res.status(404).json({ message: 'Produto não encontrado.' });
    return;
  }

  res.status(204).send();
});
