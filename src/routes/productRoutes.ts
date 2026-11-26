import { Router } from 'express';
import { requireStaffPin } from '../middlewares/staffAuth';
import { validateIdParam } from '../utils/validation';
import { productController } from '../container';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', productController.index);
router.get('/:id', productController.show);
router.post('/', requireStaffPin, productController.store);
router.put('/:id', requireStaffPin, productController.update);
router.delete('/:id', requireStaffPin, productController.destroy);

export default router;
