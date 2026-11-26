/**
 * Cliente Supabase falso para testar os Repositories no "modo Supabase"
 * sem acessar a internet nem o banco real.
 *
 * Cada chamada `from(tabela)` consome a próxima resposta enfileirada para a
 * tabela com `enqueue`. Todos os métodos encadeados (select, eq, insert...)
 * são registrados em `calls`, para o teste conferir o que foi enviado ao banco.
 */
export interface FakeResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export interface FakeCall {
  table: string;
  method: string;
  args: unknown[];
}

type Thenable = { then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown> };

class SupabaseFake {
  readonly calls: FakeCall[] = [];
  private readonly queues = new Map<string, FakeResult[]>();

  readonly client = {
    from: (table: string): unknown => {
      this.calls.push({ table, method: 'from', args: [] });
      const result = this.queues.get(table)?.shift() ?? {};
      return this.builder(table, result);
    }
  };

  enqueue(table: string, ...results: FakeResult[]): void {
    const queue = this.queues.get(table) ?? [];
    queue.push(...results);
    this.queues.set(table, queue);
  }

  /** Métodos chamados em uma tabela, na ordem (ex.: ['from', 'select', 'eq', 'maybeSingle']). */
  methods(table: string): string[] {
    return this.calls.filter((call) => call.table === table).map((call) => call.method);
  }

  /** Argumentos da primeira chamada de um método em uma tabela. */
  argsOf(table: string, method: string): unknown[] | undefined {
    return this.calls.find((call) => call.table === table && call.method === method)?.args;
  }

  reset(): void {
    this.calls.length = 0;
    this.queues.clear();
  }

  private builder(table: string, result: FakeResult): unknown {
    const response = { data: null, error: null, count: null, ...result };
    const handler: ProxyHandler<object> = {
      get: (_target, prop) => {
        if (prop === 'then') {
          const thenable: Thenable['then'] = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
          return thenable;
        }
        return (...args: unknown[]) => {
          this.calls.push({ table, method: String(prop), args });
          return proxy;
        };
      }
    };
    const proxy: object = new Proxy({}, handler);
    return proxy;
  }
}

export const supabaseFake = new SupabaseFake();

// Exposto no escopo global para a fábrica do `vi.mock` (que é içada para o topo do arquivo
// de teste e por isso não pode usar imports) encontrar o mesmo cliente falso.
declare global {
  // eslint-disable-next-line no-var
  var pastificoSupabaseFake: SupabaseFake;
}
globalThis.pastificoSupabaseFake = supabaseFake;
