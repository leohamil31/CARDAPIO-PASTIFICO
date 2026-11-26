import { vi } from 'vitest';
import type { ICategoryRepository } from '../../src/repositories/categoryRepository';
import type { IProductRepository } from '../../src/repositories/productRepository';
import type { IOrderRepository } from '../../src/repositories/orderRepository';
import type { Category } from '../../src/models/Category';
import type { Product } from '../../src/models/Product';
import type { Order } from '../../src/models/Order';

/**
 * Repositories falsos (mocks) para os testes unitários dos Services.
 * Cada método é um `vi.fn()`, então o teste decide o que o "banco" devolve
 * e verifica quais métodos foram chamados, sem tocar em banco nenhum.
 */
export const mockCategoryRepository = () => ({
  findAll: vi.fn<ICategoryRepository['findAll']>(),
  findById: vi.fn<ICategoryRepository['findById']>(),
  findByName: vi.fn<ICategoryRepository['findByName']>(),
  create: vi.fn<ICategoryRepository['create']>(),
  update: vi.fn<ICategoryRepository['update']>(),
  remove: vi.fn<ICategoryRepository['remove']>()
});

export const mockProductRepository = () => ({
  findAll: vi.fn<IProductRepository['findAll']>(),
  findById: vi.fn<IProductRepository['findById']>(),
  findByName: vi.fn<IProductRepository['findByName']>(),
  countByCategory: vi.fn<IProductRepository['countByCategory']>(),
  create: vi.fn<IProductRepository['create']>(),
  update: vi.fn<IProductRepository['update']>(),
  remove: vi.fn<IProductRepository['remove']>()
});

export const mockOrderRepository = () => ({
  findAll: vi.fn<IOrderRepository['findAll']>(),
  findById: vi.fn<IOrderRepository['findById']>(),
  existsWithProduct: vi.fn<IOrderRepository['existsWithProduct']>(),
  create: vi.fn<IOrderRepository['create']>(),
  update: vi.fn<IOrderRepository['update']>(),
  updateStatus: vi.fn<IOrderRepository['updateStatus']>(),
  remove: vi.fn<IOrderRepository['remove']>()
});

export const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
export const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
export const ORDER_ID = '33333333-3333-4333-8333-333333333333';
export const OTHER_ID = '44444444-4444-4444-8444-444444444444';

export const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: CATEGORY_ID,
  name: 'Massas',
  description: 'Especialidades artesanais',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

export const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: PRODUCT_ID,
  name: 'Spaghetti Carbonara',
  description: 'Massa cremosa',
  price: 42.9,
  image: '/images/carbonara.jpg',
  isAvailable: true,
  categoryId: CATEGORY_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

export const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: ORDER_ID,
  customerName: 'Maria',
  tableNumber: 5,
  status: 'Recebido',
  items: [{ id: OTHER_ID, productId: PRODUCT_ID, name: 'Spaghetti Carbonara', quantity: 1, unitPrice: 42.9, subtotal: 42.9, options: [] }],
  total: 42.9,
  createdAt: '2026-01-01T00:00:00.000Z',
  paymentMethod: 'Dinheiro',
  paymentStatus: 'Aguardando no caixa',
  ...overrides
});
