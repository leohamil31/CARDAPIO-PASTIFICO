import { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

/** Erros lançados pelo body-parser do Express (`express.json()`). */
interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

/** Erros retornados pelo PostgREST/Supabase carregam o código SQLSTATE do Postgres. */
interface PostgresError {
  code?: string;
  message?: string;
  details?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Converte códigos do PostgreSQL em respostas HTTP adequadas, evitando que
 * violações de integridade apareçam para o cliente como erro 500.
 */
const mapPostgresError = (error: PostgresError): HttpError | undefined => {
  switch (error.code) {
    case '23505':
      return new HttpError(409, 'Já existe um registro com esses dados (valor duplicado).');
    case '23503':
      return new HttpError(409, 'Operação não permitida: o registro está relacionado a outros dados.');
    case '23502':
    case '23514':
    case '22P02':
      return new HttpError(400, 'Dados inválidos para o banco de dados.');
    default:
      return undefined;
  }
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ message: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
};

// O Express identifica middlewares de erro pela assinatura com 4 parâmetros.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (isObject(error)) {
    const bodyError = error as unknown as BodyParserError;

    if (bodyError.type === 'entity.parse.failed') {
      res.status(400).json({ message: 'O corpo da requisição não é um JSON válido.' });
      return;
    }

    if (bodyError.type === 'entity.too.large') {
      res.status(413).json({ message: 'O corpo da requisição excede o tamanho permitido.' });
      return;
    }

    const clientStatus = bodyError.status ?? bodyError.statusCode;
    if (typeof clientStatus === 'number' && clientStatus >= 400 && clientStatus < 500) {
      res.status(clientStatus).json({ message: bodyError.message || 'Requisição inválida.' });
      return;
    }

    const mapped = mapPostgresError(error as PostgresError);
    if (mapped) {
      res.status(mapped.statusCode).json({ message: mapped.message });
      return;
    }
  }

  // Detalhes técnicos ficam apenas no log do servidor; o cliente recebe uma mensagem genérica.
  console.error('Erro não tratado:', error);
  res.status(500).json({ message: 'Erro interno do servidor.' });
};
