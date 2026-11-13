import { randomUUID } from 'node:crypto';
import { Category } from '../models/Category';
import { isSupabaseConfigured, requireSupabaseClient } from '../config/supabaseClient';
import { ensureDatabaseFile, saveDatabase } from '../config/localDatabase';
import { isValidUuid } from '../utils/uuid';
import { escapeLikePattern } from '../utils/text';
import { HttpError } from '../middlewares/errorHandler';

interface CategoryRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

const mapCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at
});

const findAllLocal = (): Category[] => ensureDatabaseFile().categories;

const persistLocal = (categories: Category[]): void => {
  const db = ensureDatabaseFile();
  saveDatabase({ ...db, categories });
};

export const categoryRepository = {
  async findAll(): Promise<Category[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient().from('categories').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(mapCategory);
    }
    return findAllLocal();
  },

  async findById(id: string): Promise<Category | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from('categories').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? mapCategory(data) : undefined;
    }
    return findAllLocal().find((category) => category.id === id);
  },

  async create(name: string, description: string): Promise<Category> {
    const trimmedName = name.trim();

    if (isSupabaseConfigured()) {
      const supabase = requireSupabaseClient();
      const { data: existing, error: existingError } = await supabase.from('categories').select('id').ilike('name', escapeLikePattern(trimmedName)).limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) throw new HttpError(409, 'Já existe uma categoria com esse nome.');

      const { data, error } = await supabase.from('categories').insert({ id: randomUUID(), name: trimmedName, description }).select().single();
      if (error) throw error;
      return mapCategory(data);
    }

    const categories = findAllLocal();
    const existingCategory = categories.find((category) => category.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingCategory) throw new HttpError(409, 'Já existe uma categoria com esse nome.');

    const category: Category = {
      id: randomUUID(),
      name: trimmedName,
      description,
      createdAt: new Date().toISOString()
    };

    categories.push(category);
    persistLocal(categories);
    return category;
  },

  async update(id: string, changes: Partial<Omit<Category, 'id' | 'createdAt'>>): Promise<Category | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from('categories').update(changes).eq('id', id).select().maybeSingle();
      if (error) throw error;
      return data ? mapCategory(data) : undefined;
    }

    const categories = findAllLocal();
    const category = categories.find((current) => current.id === id);
    if (!category) return undefined;

    if (changes.name !== undefined) {
      const newName = changes.name.toLowerCase();
      const duplicate = categories.some((current) => current.id !== id && current.name.toLowerCase() === newName);
      if (duplicate) throw new HttpError(409, 'Já existe uma categoria com esse nome.');
    }

    Object.assign(category, changes);
    persistLocal(categories);
    return category;
  },

  async remove(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return false;
      const supabase = requireSupabaseClient();
      const { count: productCount, error: productError } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id);
      if (productError) throw productError;
      if (productCount) throw new HttpError(409, 'Não é possível remover: existem produtos vinculados a esta categoria.');

      const { error, count } = await supabase.from('categories').delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      return Boolean(count);
    }

    const db = ensureDatabaseFile();
    const categories = db.categories;
    const index = categories.findIndex((category) => category.id === id);
    if (index === -1) return false;

    if (db.products.some((product) => product.categoryId === id)) {
      throw new HttpError(409, 'Não é possível remover: existem produtos vinculados a esta categoria.');
    }

    categories.splice(index, 1);
    persistLocal(categories);
    return true;
  }
};
