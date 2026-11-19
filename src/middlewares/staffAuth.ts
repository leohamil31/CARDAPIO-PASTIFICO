import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Protege as rotas da equipe (cozinha, histórico e cadastro do cardápio) com o
 * PIN da cozinha, enviado no cabeçalho `x-kitchen-pin`.
 *
 * A proteção só liga quando a variável de ambiente KITCHEN_PIN está definida
 * (ex.: no deploy da Vercel). Sem ela — desenvolvimento local e testes — a API
 * continua aberta, como no enunciado do projeto.
 */
export const requireStaffPin = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.KITCHEN_PIN?.trim();
  if (!expected) {
    next();
    return;
  }

  const received = String(req.get('x-kitchen-pin') ?? '').trim();
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // Comparação em tempo constante para não "vazar" o PIN pelo tempo de resposta.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ message: 'PIN da cozinha ausente ou incorreto (cabeçalho x-kitchen-pin).' });
    return;
  }
  next();
};
