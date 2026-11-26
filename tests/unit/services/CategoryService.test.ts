import { beforeEach, describe, expect, it } from 'vitest';
import { CategoryService } from '../../../src/services/CategoryService';
import { CATEGORY_ID, makeCategory, mockCategoryRepository, mockProductRepository, OTHER_ID } from '../mocks';

describe('CategoryService (unitário)', () => {
  let categories: ReturnType<typeof mockCategoryRepository>;
  let products: ReturnType<typeof mockProductRepository>;
  let service: CategoryService;

  beforeEach(() => {
    categories = mockCategoryRepository();
    products = mockProductRepository();
    service = new CategoryService(categories, products);
  });

  describe('list e getById', () => {
    it('lista as categorias vindas do repository', async () => {
      categories.findAll.mockResolvedValue([makeCategory()]);
      await expect(service.list()).resolves.toHaveLength(1);
    });

    it('retorna a categoria quando ela existe', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      await expect(service.getById(CATEGORY_ID)).resolves.toMatchObject({ id: CATEGORY_ID });
    });

    it('lança 404 quando a categoria não existe', async () => {
      categories.findById.mockResolvedValue(undefined);
      await expect(service.getById(CATEGORY_ID)).rejects.toMatchObject({ statusCode: 404, message: CategoryService.NOT_FOUND });
    });
  });

  describe('create', () => {
    it('cria a categoria com nome e descrição sem espaços extras', async () => {
      categories.findByName.mockResolvedValue(undefined);
      categories.create.mockImplementation(async (input) => makeCategory(input));

      const created = await service.create({ name: '  Risotos  ', description: ' Arroz arbóreo ' });

      expect(categories.create).toHaveBeenCalledWith({ name: 'Risotos', description: 'Arroz arbóreo' });
      expect(created.name).toBe('Risotos');
    });

    it('impede nome duplicado (409) sem gravar no banco', async () => {
      categories.findByName.mockResolvedValue(makeCategory({ name: 'Massas' }));

      await expect(service.create({ name: 'massas', description: 'x' })).rejects.toMatchObject({ statusCode: 409 });
      expect(categories.create).not.toHaveBeenCalled();
    });

    it('rejeita nome ou descrição em branco (400)', async () => {
      await expect(service.create({ name: '   ', description: 'x' })).rejects.toMatchObject({ statusCode: 400 });
      expect(categories.findByName).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('exige ao menos um campo (400)', async () => {
      await expect(service.update(CATEGORY_ID, {})).rejects.toMatchObject({ statusCode: 400 });
      expect(categories.findById).not.toHaveBeenCalled();
    });

    it('retorna 404 quando a categoria não existe', async () => {
      categories.findById.mockResolvedValue(undefined);
      await expect(service.update(CATEGORY_ID, { description: 'nova' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('impede renomear para o nome de outra categoria (409)', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      categories.findByName.mockResolvedValue(makeCategory({ id: OTHER_ID, name: 'Bebidas' }));

      await expect(service.update(CATEGORY_ID, { name: 'Bebidas' })).rejects.toMatchObject({ statusCode: 409 });
      expect(categories.update).not.toHaveBeenCalled();
    });

    it('permite manter o próprio nome e atualiza', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      categories.findByName.mockResolvedValue(makeCategory());
      categories.update.mockResolvedValue(makeCategory({ description: 'Atualizada' }));

      const updated = await service.update(CATEGORY_ID, { name: 'Massas', description: 'Atualizada' });

      expect(updated.description).toBe('Atualizada');
      expect(categories.update).toHaveBeenCalledWith(CATEGORY_ID, { name: 'Massas', description: 'Atualizada' });
    });

    it('retorna 404 se o registro sumir durante a atualização', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      categories.update.mockResolvedValue(undefined);
      await expect(service.update(CATEGORY_ID, { description: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('remove', () => {
    it('remove a categoria sem produtos vinculados', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      products.countByCategory.mockResolvedValue(0);
      categories.remove.mockResolvedValue(true);

      await expect(service.remove(CATEGORY_ID)).resolves.toBeUndefined();
      expect(categories.remove).toHaveBeenCalledWith(CATEGORY_ID);
    });

    it('impede remover categoria com produtos (409)', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      products.countByCategory.mockResolvedValue(3);

      await expect(service.remove(CATEGORY_ID)).rejects.toMatchObject({ statusCode: 409, message: CategoryService.HAS_PRODUCTS });
      expect(categories.remove).not.toHaveBeenCalled();
    });

    it('retorna 404 para categoria inexistente', async () => {
      categories.findById.mockResolvedValue(undefined);
      await expect(service.remove(CATEGORY_ID)).rejects.toMatchObject({ statusCode: 404 });
      expect(products.countByCategory).not.toHaveBeenCalled();
    });

    it('retorna 404 se o repository não remover nada', async () => {
      categories.findById.mockResolvedValue(makeCategory());
      products.countByCategory.mockResolvedValue(0);
      categories.remove.mockResolvedValue(false);
      await expect(service.remove(CATEGORY_ID)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
