import { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ message: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    const message = 'type' in error && error.type === 'entity.parse.failed'
      ? 'O corpo da requisição contém JSON inválido.'
      : error.status === 413
        ? 'O corpo da requisição excede o limite permitido.'
        : 'A requisição é inválida.';
    res.status(error.status).json({ message });
    return;
  }

  console.error('Erro não tratado:', error);
  res.status(500).json({ message: 'Erro interno do servidor.' });
};
