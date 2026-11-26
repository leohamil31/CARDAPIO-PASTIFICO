import { beforeEach, describe, expect, it } from 'vitest';
import { ProductService } from '../../../src/services/ProductService';
import { CATEGORY_ID, makeCategory, makeProduct, mockCategoryRepository, mockOrderRepository, mockProductRepository, OTHER_ID, PRODUCT_ID } from '../mocks';

const validInput = {
  name: 'Ravioli de Abóbora',
  description: 'Ravioli artesanal',
  price: 45,
  image: '/images/ravioli.jpg',
  isAvailable: true,
  categoryId: CATEGORY_ID
};

describe('ProductService (unitário)', () => {
  let products: ReturnType<typeof mockProductRepository>;
  let categories: ReturnType<typeof mockCategoryRepository>;
  let orders: ReturnType<typeof mockOrderRepository>;
  let service: ProductService;

  beforeEach(() => {
    products = mockProductRepository();
    categories = mockCategoryRepository();
    orders = mockOrderRepository();
    service = new ProductService(products, categories, orders);
  });

  describe('list e getById', () => {
    it('lista os produtos', async () => {
      products.findAll.mockResolvedValue([makeProduct(), makeProduct({ id: OTHER_ID })]);
      await expect(service.list()).resolves.toHaveLength(2);
    });

    it('retorna 404 para produto inexistente', async () => {
      products.findById.mockResolvedValue(undefined);
      await expect(service.getById(PRODUCT_ID)).rejects.toMatchObject({ statusCode: 404, message: ProductService.NOT_FOUND });
    });
  });

  describe('create', () => {
    it('cria o produto quando a categoria existe e o nome está livre', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      products.findByName.mockResolvedValue(undefined);
      products.create.mockImplementation(async (input) => makeProduct(input));

      const created = await service.create({ ...validInput, name: '  Ravioli de Abóbora ' });

      expect(created.name).toBe('Ravioli de Abóbora');
      expect(products.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ravioli de Abóbora', price: 45 }));
    });

    it('regra de negócio: não aceita preço negativo (400) e nem consulta o banco', async () => {
      await expect(service.create({ ...validInput, price: -1 })).rejects.toMatchObject({ statusCode: 400, message: ProductService.NEGATIVE_PRICE });
      expect(categories.findById).not.toHaveBeenCalled();
      expect(products.create).not.toHaveBeenCalled();
    });

    it('rejeita categoria inexistente (400)', async () => {
      categories.findById.mockResolvedValue(undefined);
      await expect(service.create(validInput)).rejects.toMatchObject({ statusCode: 400, message: ProductService.CATEGORY_NOT_FOUND });
    });

    it('rejeita nome duplicado (409)', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      products.findByName.mockResolvedValue(makeProduct({ name: validInput.name }));
      await expect(service.create(validInput)).rejects.toMatchObject({ statusCode: 409 });
      expect(products.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('exige ao menos um campo (400)', async () => {
      await expect(service.update(PRODUCT_ID, {})).rejects.toMatchObject({ statusCode: 400 });
    });

    it('retorna 404 para produto inexistente', async () => {
      products.findById.mockResolvedValue(undefined);
      await expect(service.update(PRODUCT_ID, { price: 10 })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('não aceita preço negativo na atualização (400)', async () => {
      products.findById.mockResolvedValue(makeProduct());
      await expect(service.update(PRODUCT_ID, { price: -0.01 })).rejects.toMatchObject({ statusCode: 400 });
      expect(products.update).not.toHaveBeenCalled();
    });

    it('não aceita trocar para categoria inexistente (400)', async () => {
      products.findById.mockResolvedValue(makeProduct());
      categories.findById.mockResolvedValue(undefined);
      await expect(service.update(PRODUCT_ID, { categoryId: OTHER_ID })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('não aceita renomear para nome de outro produto (409)', async () => {
      products.findById.mockResolvedValue(makeProduct());
      products.findByName.mockResolvedValue(makeProduct({ id: OTHER_ID, name: 'Tiramisu' }));
      await expect(service.update(PRODUCT_ID, { name: 'Tiramisu' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('atualiza preço, categoria e nome quando tudo é válido', async () => {
      products.findById.mockResolvedValue(makeProduct());
      categories.findById.mockResolvedValue(makeCategory({ id: OTHER_ID }));
      products.findByName.mockResolvedValue(undefined);
      products.update.mockResolvedValue(makeProduct({ price: 50, categoryId: OTHER_ID, name: 'Carbonara Especial' }));

      const updated = await service.update(PRODUCT_ID, { price: 50, categoryId: OTHER_ID, name: 'Carbonara Especial' });

      expect(updated.price).toBe(50);
      expect(products.update).toHaveBeenCalledWith(PRODUCT_ID, { price: 50, categoryId: OTHER_ID, name: 'Carbonara Especial' });
    });

    it('retorna 404 se o repository não encontrar o produto ao gravar', async () => {
      products.findById.mockResolvedValue(makeProduct());
      products.update.mockResolvedValue(undefined);
      await expect(service.update(PRODUCT_ID, { isAvailable: false })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('remove', () => {
    it('remove produto que não aparece em pedidos', async () => {
      products.findById.mockResolvedValue(makeProduct());
      orders.existsWithProduct.mockResolvedValue(false);
      products.remove.mockResolvedValue(true);

      await service.remove(PRODUCT_ID);
      expect(products.remove).toHaveBeenCalledWith(PRODUCT_ID);
    });

    it('regra de negócio: produto usado em pedidos não pode ser removido (409)', async () => {
      products.findById.mockResolvedValue(makeProduct());
      orders.existsWithProduct.mockResolvedValue(true);

      await expect(service.remove(PRODUCT_ID)).rejects.toMatchObject({ statusCode: 409, message: ProductService.IN_USE });
      expect(products.remove).not.toHaveBeenCalled();
    });

    it('retorna 404 para produto inexistente', async () => {
      products.findById.mockResolvedValue(undefined);
      await expect(service.remove(PRODUCT_ID)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('retorna 404 se o repository não remover nada', async () => {
      products.findById.mockResolvedValue(makeProduct());
      orders.existsWithProduct.mockResolvedValue(false);
      products.remove.mockResolvedValue(false);
      await expect(service.remove(PRODUCT_ID)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
