import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { isValidUuid } from './uuid';

type Body = Record<string, unknown>;

/**
 * No Express 5, `req.body` fica `undefined` quando a requisição não tem corpo
 * JSON (ex.: Content-Type ausente). Desestruturar `undefined` lança TypeError
 * e geraria um 500; por isso sempre lemos o corpo através desta função.
 */
export const getBody = (req: Request): Body => {
  const body: unknown = req.body;
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'O corpo da requisição deve ser um objeto JSON.');
  }
  return body as Body;
};

/** Lê um texto obrigatório, já sem espaços nas pontas. */
export const requireString = (value: unknown, field: string, maxLength = 255): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `O campo "${field}" é obrigatório e deve ser um texto.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `O campo "${field}" deve ter no máximo ${maxLength} caracteres.`);
  }
  return trimmed;
};

/** Lê um texto opcional (para atualizações parciais). */
export const optionalString = (value: unknown, field: string, maxLength = 255): string | undefined =>
  value === undefined ? undefined : requireString(value, field, maxLength);

/** Lê um preço (aceita número ou texto numérico), >= 0 e com no máximo 2 casas. */
export const requirePrice = (value: unknown, field = 'price'): number => {
  const price = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
    throw new HttpError(400, `O campo "${field}" deve ser um número maior ou igual a zero.`);
  }
  return Math.round(price * 100) / 100;
};

/** Lê um inteiro positivo (ex.: número da mesa, quantidade). */
export const requirePositiveInteger = (value: unknown, field: string): number => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    throw new HttpError(400, `O campo "${field}" deve ser um número inteiro maior que zero.`);
  }
  return number;
};

/** Lê um booleano opcional, sem aceitar valores ambíguos como "abc". */
export const optionalBoolean = (value: unknown, field: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new HttpError(400, `O campo "${field}" deve ser booleano (true ou false).`);
};

export const requireUuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !isValidUuid(value)) {
    throw new HttpError(400, `O campo "${field}" deve ser um UUID válido.`);
  }
  return value;
};

/**
 * Middleware para `router.param('id', ...)`: rejeita com 400 qualquer `:id`
 * que não seja UUID antes de chegar ao controller/banco de dados.
 */
export const validateIdParam = (_req: Request, res: Response, next: NextFunction, value: string): void => {
  if (!isValidUuid(value)) {
    res.status(400).json({ message: 'O id informado não é um UUID válido.' });
    return;
  }
  next();
};
