import { Request, Response } from 'express';
import { categoryRepository } from '../repositories/categoryRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getIdParam } from '../utils/params';
import { isValidUuid } from '../utils/uuid';

const isRequestBody = (body: unknown): body is Record<string, unknown> =>
  body !== null && typeof body === 'object' && !Array.isArray(body);

const invalidCategoryId = (id: string, res: Response): boolean => {
  if (isValidUuid(id)) return false;
  res.status(400).json({ message: 'O id da categoria deve ser um UUID válido.' });
  return true;
};

export const listCategories = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await categoryRepository.findAll());
});

export const showCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidCategoryId(id, res)) return;

  const category = await categoryRepository.findById(id);

  if (!category) {
    res.status(404).json({ message: 'Categoria não encontrada.' });
    return;
  }

  res.status(200).json(category);
});

export const storeCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!isRequestBody(req.body)) {
    res.status(400).json({ message: 'O corpo da requisição deve ser um objeto JSON.' });
    return;
  }

  const { name, description } = req.body;
  if (typeof name !== 'string' || !name.trim() || typeof description !== 'string' || !description.trim()) {
    res.status(400).json({ message: 'Nome e descrição são obrigatórios.' });
    return;
  }

  const category = await categoryRepository.create(name.trim(), description.trim());
  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidCategoryId(id, res)) return;
  if (!isRequestBody(req.body)) {
    res.status(400).json({ message: 'O corpo da requisição deve ser um objeto JSON.' });
    return;
  }

  const { name, description } = req.body;

  if (name === undefined && description === undefined) {
    res.status(400).json({ message: 'Informe ao menos um campo para atualizar (name ou description).' });
    return;
  }

  const changes: Partial<{ name: string; description: string }> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ message: 'O nome da categoria deve ser um texto não vazio.' });
      return;
    }
    changes.name = name.trim();
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ message: 'A descrição da categoria deve ser um texto não vazio.' });
      return;
    }
    changes.description = description.trim();
  }

  const category = await categoryRepository.update(id, changes);

  if (!category) {
    res.status(404).json({ message: 'Categoria não encontrada.' });
    return;
  }

  res.status(200).json(category);
});

export const destroyCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = getIdParam(req.params.id);
  if (invalidCategoryId(id, res)) return;

  const removed = await categoryRepository.remove(id);

  if (!removed) {
    res.status(404).json({ message: 'Categoria não encontrada.' });
    return;
  }

  res.status(204).send();
});
