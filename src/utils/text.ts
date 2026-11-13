/**
 * Escapa os curingas do operador ILIKE do PostgreSQL (`%`, `_` e `\`) para
 * que a busca por nome seja exata (apenas sem diferenciar maiúsculas).
 * Sem isso, um nome como "%" casaria com vários registros e o
 * `.maybeSingle()` do Supabase falharia com erro 500.
 */
export const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);
