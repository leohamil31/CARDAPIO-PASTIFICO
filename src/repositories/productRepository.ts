import { randomUUID } from 'node:crypto';
import { Product } from '../models/Product';
import { isSupabaseConfigured, requireSupabaseClient } from '../config/supabaseClient';
import { ensureDatabaseFile, saveDatabase } from '../config/localDatabase';
import { isValidUuid } from '../utils/uuid';
import { escapeLikePattern } from '../utils/text';
import { HttpError } from '../middlewares/errorHandler';

export type ProductInput = Omit<Product, 'id' | 'createdAt'>;
export type ProductChanges = Partial<ProductInput>;

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

const IN_USE_MESSAGE = 'Não é possível remover: o produto já aparece em pedidos. Marque-o como indisponível (isAvailable: false).';
const DUPLICATE_MESSAGE = 'Já existe um produto com esse nome.';

const mapProduct = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  image: row.image,
  isAvailable: row.is_available,
  categoryId: row.category_id,
  createdAt: row.created_at
});

const findAllLocal = (): Product[] => ensureDatabaseFile().products;

const persistLocal = (products: Product[]): void => {
  const db = ensureDatabaseFile();
  saveDatabase({ ...db, products });
};

export const productRepository = {
  async findAll(): Promise<Product[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient().from('products').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(mapProduct);
    }
    return findAllLocal();
  },

  async findById(id: string): Promise<Product | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from('products').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? mapProduct(data) : undefined;
    }
    return findAllLocal().find((product) => product.id === id);
  },

  async create(input: ProductInput): Promise<Product> {
    const name = input.name.trim();

    if (isSupabaseConfigured()) {
      const supabase = requireSupabaseClient();
      const { data: existing, error: existingError } = await supabase.from('products').select('id').ilike('name', escapeLikePattern(name)).limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) throw new HttpError(409, DUPLICATE_MESSAGE);

      const { data, error } = await supabase.from('products').insert({
        id: randomUUID(),
        name,
        description: input.description,
        price: input.price,
        image: input.image,
        is_available: input.isAvailable,
        category_id: input.categoryId
      }).select().single();
      if (error) throw error;
      return mapProduct(data);
    }

    const products = findAllLocal();
    const existingProduct = products.find((product) => product.name.toLowerCase() === name.toLowerCase());
    if (existingProduct) throw new HttpError(409, DUPLICATE_MESSAGE);

    const product: Product = {
      id: randomUUID(),
      name,
      description: input.description,
      price: input.price,
      image: input.image,
      isAvailable: input.isAvailable,
      categoryId: input.categoryId,
      createdAt: new Date().toISOString()
    };

    products.push(product);
    persistLocal(products);
    return product;
  },

  async update(id: string, changes: ProductChanges): Promise<Product | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const payload: Record<string, unknown> = { ...changes };
      if ('isAvailable' in changes) {
        payload.is_available = changes.isAvailable;
        delete payload.isAvailable;
      }
      if ('categoryId' in changes) {
        payload.category_id = changes.categoryId;
        delete payload.categoryId;
      }
      const { data, error } = await requireSupabaseClient().from('products').update(payload).eq('id', id).select().maybeSingle();
      if (error) throw error;
      return data ? mapProduct(data) : undefined;
    }

    const products = findAllLocal();
    const product = products.find((current) => current.id === id);
    if (!product) return undefined;

    if (changes.name !== undefined) {
      const newName = changes.name.toLowerCase();
      if (products.some((current) => current.id !== id && current.name.toLowerCase() === newName)) {
        throw new HttpError(409, DUPLICATE_MESSAGE);
      }
    }

    Object.assign(product, changes);
    persistLocal(products);
    return product;
  },

  async remove(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return false;
      const { error, count } = await requireSupabaseClient().from('products').delete({ count: 'exact' }).eq('id', id);
      // 23503 = violação de chave estrangeira (order_items.product_id → products.id).
      if (error?.code === '23503') throw new HttpError(409, IN_USE_MESSAGE);
      if (error) throw error;
      return Boolean(count);
    }

    const db = ensureDatabaseFile();
    const products = db.products;
    const index = products.findIndex((product) => product.id === id);
    if (index === -1) return false;

    // Mantém o mesmo comportamento da chave estrangeira do PostgreSQL no modo local.
    if (db.orders.some((order) => order.items.some((item) => item.productId === id))) {
      throw new HttpError(409, IN_USE_MESSAGE);
    }

    products.splice(index, 1);
    persistLocal(products);
    return true;
  }
};
