import { Category } from '../models/Category';
import { CategoryChanges, CategoryInput, ICategoryRepository } from '../repositories/categoryRepository';
import { IProductRepository } from '../repositories/productRepository';
import { ConflictError, NotFoundError, ValidationError } from '../errors/HttpError';

/**
 * Regras de negócio de categorias:
 * - o nome é obrigatório e único (sem diferenciar maiúsculas/minúsculas);
 * - uma atualização precisa alterar ao menos um campo;
 * - não é possível remover uma categoria que ainda tem produtos vinculados.
 */
export class CategoryService {
  static readonly NOT_FOUND = 'Categoria não encontrada.';
  static readonly DUPLICATE = 'Já existe uma categoria com esse nome.';
  static readonly HAS_PRODUCTS = 'Não é possível remover: existem produtos vinculados a esta categoria.';

  constructor(
    private readonly categoryRepository: ICategoryRepository,
    private readonly productRepository: IProductRepository
  ) {}

  async list(): Promise<Category[]> {
    return this.categoryRepository.findAll();
  }

  async getById(id: string): Promise<Category> {
    const category = await this.categoryRepository.findById(id);
    if (!category) throw new NotFoundError(CategoryService.NOT_FOUND);
    return category;
  }

  async create(input: CategoryInput): Promise<Category> {
    const name = input.name.trim();
    const description = input.description.trim();
    if (!name || !description) throw new ValidationError('Nome e descrição da categoria são obrigatórios.');

    await this.ensureNameIsAvailable(name);
    return this.categoryRepository.create({ name, description });
  }

  async update(id: string, changes: CategoryChanges): Promise<Category> {
    if (changes.name === undefined && changes.description === undefined) {
      throw new ValidationError('Informe ao menos um campo para atualizar (name ou description).');
    }

    await this.getById(id);
    if (changes.name !== undefined) await this.ensureNameIsAvailable(changes.name, id);

    const updated = await this.categoryRepository.update(id, changes);
    if (!updated) throw new NotFoundError(CategoryService.NOT_FOUND);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);

    const linkedProducts = await this.productRepository.countByCategory(id);
    if (linkedProducts > 0) throw new ConflictError(CategoryService.HAS_PRODUCTS);

    const removed = await this.categoryRepository.remove(id);
    if (!removed) throw new NotFoundError(CategoryService.NOT_FOUND);
  }

  /** Impede nomes repetidos; `ignoreId` permite manter o próprio nome numa atualização. */
  private async ensureNameIsAvailable(name: string, ignoreId?: string): Promise<void> {
    const existing = await this.categoryRepository.findByName(name);
    if (existing && existing.id !== ignoreId) throw new ConflictError(CategoryService.DUPLICATE);
  }
}
