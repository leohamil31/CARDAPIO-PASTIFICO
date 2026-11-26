/**
 * Erro de aplicação com o código HTTP que deve ser devolvido ao cliente.
 * Lançado pelas camadas de Service (regras de negócio) e Controller (validação
 * da entrada) e convertido em resposta JSON pelo middleware `errorHandler`.
 */
export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

/** Atalhos para os erros mais usados pelas regras de negócio. */
export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}
