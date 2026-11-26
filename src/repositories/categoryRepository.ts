import { randomUUID } from 'node:crypto';
import { Category } from '../models/Category';
import { isSupabaseConfigured, requireSupabaseClient } from '../config/supabaseClient';
import { ensureDatabaseFile, saveDatabase } from '../config/localDatabase';
import { isValidUuid } from '../utils/uuid';
import { escapeLikePattern } from '../utils/text';

export type CategoryInput = Omit<Category, 'id' | 'createdAt'>;
export type CategoryChanges = Partial<CategoryInput>;

/** Contrato da camada de acesso a dados de categorias (permite trocar/mocar a implementação). */
export interface ICategoryRepository {
  findAll(): Promise<Category[]>;
  findById(id: string): Promise<Category | undefined>;
  findByName(name: string): Promise<Category | undefined>;
  create(input: CategoryInput): Promise<Category>;
  update(id: string, changes: CategoryChanges): Promise<Category | undefined>;
  remove(id: string): Promise<boolean>;
}

interface CategoryRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

/**
 * Repository de categorias: só conversa com o banco (Supabase/PostgreSQL ou o
 * arquivo JSON local usado em desenvolvimento e testes). As regras de negócio
 * ficam em `CategoryService`.
 */
export class CategoryRepository implements ICategoryRepository {
  private static readonly TABLE = 'categories';

  private static toEntity(row: CategoryRow): Category {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at
    };
  }

  private readLocal(): Category[] {
    return ensureDatabaseFile().categories;
  }

  private writeLocal(categories: Category[]): void {
    saveDatabase({ ...ensureDatabaseFile(), categories });
  }

  async findAll(): Promise<Category[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient().from(CategoryRepository.TABLE).select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(CategoryRepository.toEntity);
    }
    return this.readLocal();
  }

  async findById(id: string): Promise<Category | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from(CategoryRepository.TABLE).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? CategoryRepository.toEntity(data) : undefined;
    }
    return this.readLocal().find((category) => category.id === id);
  }

  /** Busca pelo nome sem diferenciar maiúsculas/minúsculas. */
  async findByName(name: string): Promise<Category | undefined> {
    const trimmed = name.trim();
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient().from(CategoryRepository.TABLE).select('*').ilike('name', escapeLikePattern(trimmed)).limit(1);
      if (error) throw error;
      return data && data.length > 0 ? CategoryRepository.toEntity(data[0]) : undefined;
    }
    const lower = trimmed.toLowerCase();
    return this.readLocal().find((category) => category.name.toLowerCase() === lower);
  }

  async create(input: CategoryInput): Promise<Category> {
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient()
        .from(CategoryRepository.TABLE)
        .insert({ id: randomUUID(), name: input.name, description: input.description })
        .select()
        .single();
      if (error) throw error;
      return CategoryRepository.toEntity(data);
    }

    const categories = this.readLocal();
    const category: Category = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      createdAt: new Date().toISOString()
    };
    categories.push(category);
    this.writeLocal(categories);
    return category;
  }

  async update(id: string, changes: CategoryChanges): Promise<Category | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from(CategoryRepository.TABLE).update(changes).eq('id', id).select().maybeSingle();
      if (error) throw error;
      return data ? CategoryRepository.toEntity(data) : undefined;
    }

    const categories = this.readLocal();
    const category = categories.find((current) => current.id === id);
    if (!category) return undefined;

    Object.assign(category, changes);
    this.writeLocal(categories);
    return category;
  }

  async remove(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return false;
      const { error, count } = await requireSupabaseClient().from(CategoryRepository.TABLE).delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      return Boolean(count);
    }

    const categories = this.readLocal();
    const index = categories.findIndex((category) => category.id === id);
    if (index === -1) return false;

    categories.splice(index, 1);
    this.writeLocal(categories);
    return true;
  }
}
