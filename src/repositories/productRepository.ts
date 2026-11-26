import { randomUUID } from 'node:crypto';
import { Product } from '../models/Product';
import { isSupabaseConfigured, requireSupabaseClient } from '../config/supabaseClient';
import { ensureDatabaseFile, saveDatabase } from '../config/localDatabase';
import { isValidUuid } from '../utils/uuid';
import { escapeLikePattern } from '../utils/text';
import { ConflictError } from '../errors/HttpError';

export type ProductInput = Omit<Product, 'id' | 'createdAt'>;
export type ProductChanges = Partial<ProductInput>;

/** Contrato da camada de acesso a dados de produtos. */
export interface IProductRepository {
  findAll(): Promise<Product[]>;
  findById(id: string): Promise<Product | undefined>;
  findByName(name: string): Promise<Product | undefined>;
  countByCategory(categoryId: string): Promise<number>;
  create(input: ProductInput): Promise<Product>;
  update(id: string, changes: ProductChanges): Promise<Product | undefined>;
  remove(id: string): Promise<boolean>;
}

interface ProductRow {
  id: string;
  name: string;
  description: string;
  price: number | string;
  image: string;
  is_available: boolean;
  category_id: string;
  created_at: string;
}

export const PRODUCT_IN_USE_MESSAGE = 'Não é possível remover: o produto já aparece em pedidos. Marque-o como indisponível (isAvailable: false).';

/**
 * Repository de produtos: leitura e gravação no Supabase/PostgreSQL (ou no JSON
 * local). Converte os nomes de colunas do banco (snake_case) para o model.
 */
export class ProductRepository implements IProductRepository {
  private static readonly TABLE = 'products';

  private static toEntity(row: ProductRow): Product {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      image: row.image,
      isAvailable: row.is_available,
      categoryId: row.category_id,
      createdAt: row.created_at
    };
  }

  /** Converte os campos do model para as colunas da tabela `products`. */
  private static toRow(changes: ProductChanges): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    if (changes.name !== undefined) row.name = changes.name;
    if (changes.description !== undefined) row.description = changes.description;
    if (changes.price !== undefined) row.price = changes.price;
    if (changes.image !== undefined) row.image = changes.image;
    if (changes.isAvailable !== undefined) row.is_available = changes.isAvailable;
    if (changes.categoryId !== undefined) row.category_id = changes.categoryId;
    return row;
  }

  private readLocal(): Product[] {
    return ensureDatabaseFile().products;
  }

  private writeLocal(products: Product[]): void {
    saveDatabase({ ...ensureDatabaseFile(), products });
  }

  async findAll(): Promise<Product[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient().from(ProductRepository.TABLE).select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(ProductRepository.toEntity);
    }
    return this.readLocal();
  }

  async findById(id: string): Promise<Product | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from(ProductRepository.TABLE).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? ProductRepository.toEntity(data) : undefined;
    }
    return this.readLocal().find((product) => product.id === id);
  }

  /** Busca pelo nome sem diferenciar maiúsculas/minúsculas. */
  async findByName(name: string): Promise<Product | undefined> {
    const trimmed = name.trim();
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient().from(ProductRepository.TABLE).select('*').ilike('name', escapeLikePattern(trimmed)).limit(1);
      if (error) throw error;
      return data && data.length > 0 ? ProductRepository.toEntity(data[0]) : undefined;
    }
    const lower = trimmed.toLowerCase();
    return this.readLocal().find((product) => product.name.toLowerCase() === lower);
  }

  async countByCategory(categoryId: string): Promise<number> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(categoryId)) return 0;
      const { count, error } = await requireSupabaseClient()
        .from(ProductRepository.TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId);
      if (error) throw error;
      return count ?? 0;
    }
    return this.readLocal().filter((product) => product.categoryId === categoryId).length;
  }

  async create(input: ProductInput): Promise<Product> {
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient()
        .from(ProductRepository.TABLE)
        .insert({ id: randomUUID(), ...ProductRepository.toRow(input) })
        .select()
        .single();
      if (error) throw error;
      return ProductRepository.toEntity(data);
    }

    const products = this.readLocal();
    const product: Product = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      price: input.price,
      image: input.image,
      isAvailable: input.isAvailable,
      categoryId: input.categoryId,
      createdAt: new Date().toISOString()
    };
    products.push(product);
    this.writeLocal(products);
    return product;
  }

  async update(id: string, changes: ProductChanges): Promise<Product | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient()
        .from(ProductRepository.TABLE)
        .update(ProductRepository.toRow(changes))
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data ? ProductRepository.toEntity(data) : undefined;
    }

    const products = this.readLocal();
    const product = products.find((current) => current.id === id);
    if (!product) return undefined;

    Object.assign(product, changes);
    this.writeLocal(products);
    return product;
  }

  async remove(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return false;
      const { error, count } = await requireSupabaseClient().from(ProductRepository.TABLE).delete({ count: 'exact' }).eq('id', id);
      // 23503 = violação de chave estrangeira (order_items.product_id → products.id).
      if (error?.code === '23503') throw new ConflictError(PRODUCT_IN_USE_MESSAGE);
      if (error) throw error;
      return Boolean(count);
    }

    const products = this.readLocal();
    const index = products.findIndex((product) => product.id === id);
    if (index === -1) return false;

    products.splice(index, 1);
    this.writeLocal(products);
    return true;
  }
}
