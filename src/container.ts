import { CategoryRepository } from './repositories/categoryRepository';
import { ProductRepository } from './repositories/productRepository';
import { OrderRepository } from './repositories/orderRepository';
import { CategoryService } from './services/CategoryService';
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';
import { PricingService } from './services/PricingService';
import { CategoryController } from './controllers/categoryController';
import { ProductController } from './controllers/productController';
import { OrderController } from './controllers/orderController';
import { KitchenController } from './controllers/kitchenController';

/**
 * Composição da aplicação (injeção de dependências manual):
 * Routes → Controllers → Services (regras de negócio) → Repositories (banco).
 * Os testes unitários criam os Services com repositories falsos (mocks).
 */
export const categoryRepository = new CategoryRepository();
export const productRepository = new ProductRepository();
export const orderRepository = new OrderRepository();

export const pricingService = new PricingService();
export const categoryService = new CategoryService(categoryRepository, productRepository);
export const productService = new ProductService(productRepository, categoryRepository, orderRepository);
export const orderService = new OrderService(orderRepository, productRepository, pricingService);

export const categoryController = new CategoryController(categoryService);
export const productController = new ProductController(productService);
export const orderController = new OrderController(orderService);
export const kitchenController = new KitchenController(orderService);
