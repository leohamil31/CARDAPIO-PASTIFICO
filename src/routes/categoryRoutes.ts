import { Router } from 'express';
import { validateIdParam } from '../utils/validation';
import { destroyCategory, listCategories, showCategory, storeCategory, updateCategory } from '../controllers/categoryController';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', listCategories);
router.get('/:id', showCategory);
router.post('/', storeCategory);
router.put('/:id', updateCategory);
router.delete('/:id', destroyCategory);

export default router;
