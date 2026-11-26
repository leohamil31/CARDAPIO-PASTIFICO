import { Router } from 'express';
import { requireStaffPin } from '../middlewares/staffAuth';
import { validateIdParam } from '../utils/validation';
import { categoryController } from '../container';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', categoryController.index);
router.get('/:id', categoryController.show);
router.post('/', requireStaffPin, categoryController.store);
router.put('/:id', requireStaffPin, categoryController.update);
router.delete('/:id', requireStaffPin, categoryController.destroy);

export default router;
