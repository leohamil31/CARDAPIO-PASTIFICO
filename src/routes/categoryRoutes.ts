import { Router } from 'express';
import { requireStaffPin } from '../middlewares/staffAuth';
import { validateIdParam } from '../utils/validation';
import { destroyCategory, listCategories, showCategory, storeCategory, updateCategory } from '../controllers/categoryController';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', listCategories);
router.get('/:id', showCategory);
router.post('/', requireStaffPin, storeCategory);
router.put('/:id', requireStaffPin, updateCategory);
router.delete('/:id', requireStaffPin, destroyCategory);

export default router;
