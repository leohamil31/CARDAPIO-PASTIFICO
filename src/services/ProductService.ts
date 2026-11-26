import { Product } from '../models/Product';
import { IProductRepository, PRODUCT_IN_USE_MESSAGE, ProductChanges, ProductInput } from '../repositories/productRepository';
import { ICategoryRepository } from '../repositories/categoryRepository';
import { IOrderRepository } from '../repositories/orderRepository';
import { ConflictError, NotFoundError, ValidationError } from '../errors/HttpError';

/**
 * Regras de negócio de produtos:
 * - o preço não pode ser negativo;
 * - o produto precisa pertencer a uma categoria existente;
 * - o nome é único no cardápio (sem diferenciar maiúsculas/minúsculas);
 * - um produto que já aparece em pedidos não pode ser removido (deve ser marcado como indisponível).
 */
export class ProductService {
  static readonly NOT_FOUND = 'Produto não encontrado.';
  static readonly DUPLICATE = 'Já existe um produto com esse nome.';
  static readonly CATEGORY_NOT_FOUND = 'A categoria informada (categoryId) não existe.';
  static readonly NEGATIVE_PRICE = 'O preço do produto não pode ser negativo.';
  static readonly IN_USE = PRODUCT_IN_USE_MESSAGE;

  constructor(
    private readonly productRepository: IProductRepository,
    private readonly categoryRepository: ICategoryRepository,
    private readonly orderRepository: IOrderRepository
  ) {}

  async list(): Promise<Product[]> {
    return this.productRepository.findAll();
  }

  async getById(id: string): Promise<Product> {
    const product = await this.productRepository.findById(id);
    if (!product) throw new NotFoundError(ProductService.NOT_FOUND);
    return product;
  }

  async create(input: ProductInput): Promise<Product> {
    this.ensureValidPrice(input.price);
    await this.ensureCategoryExists(input.categoryId);
    await this.ensureNameIsAvailable(input.name);

    return this.productRepository.create({ ...input, name: input.name.trim() });
  }

  async update(id: string, changes: ProductChanges): Promise<Product> {
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Informe ao menos um campo para atualizar (name, description, price, image, isAvailable ou categoryId).');
    }

    await this.getById(id);
    if (changes.price !== undefined) this.ensureValidPrice(changes.price);
    if (changes.categoryId !== undefined) await this.ensureCategoryExists(changes.categoryId);
    if (changes.name !== undefined) await this.ensureNameIsAvailable(changes.name, id);

    const updated = await this.productRepository.update(id, changes);
    if (!updated) throw new NotFoundError(ProductService.NOT_FOUND);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);

    if (await this.orderRepository.existsWithProduct(id)) {
      throw new ConflictError(ProductService.IN_USE);
    }

    const removed = await this.productRepository.remove(id);
    if (!removed) throw new NotFoundError(ProductService.NOT_FOUND);
  }

  private ensureValidPrice(price: number): void {
    if (!Number.isFinite(price) || price < 0) throw new ValidationError(ProductService.NEGATIVE_PRICE);
  }

  private async ensureCategoryExists(categoryId: string): Promise<void> {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) throw new ValidationError(ProductService.CATEGORY_NOT_FOUND);
  }

  private async ensureNameIsAvailable(name: string, ignoreId?: string): Promise<void> {
    const existing = await this.productRepository.findByName(name);
    if (existing && existing.id !== ignoreId) throw new ConflictError(ProductService.DUPLICATE);
  }
}
