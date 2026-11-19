import { Router } from 'express';
import { requireStaffPin } from '../middlewares/staffAuth';
import { validateIdParam } from '../utils/validation';
import { destroyProduct, listProducts, showProduct, storeProduct, updateProductController } from '../controllers/productController';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', listProducts);
router.get('/:id', showProduct);
router.post('/', requireStaffPin, storeProduct);
router.put('/:id', requireStaffPin, updateProductController);
router.delete('/:id', requireStaffPin, destroyProduct);

export default router;
