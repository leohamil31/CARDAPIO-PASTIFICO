import { Router } from 'express';
import { requireStaffPin } from '../middlewares/staffAuth';
import { validateIdParam } from '../utils/validation';
import { kitchenController, orderController } from '../container';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', requireStaffPin, orderController.index);
router.get('/kitchen', requireStaffPin, kitchenController.openOrders);
router.get('/table/:tableNumber', requireStaffPin, kitchenController.tableOrders);
router.post('/', orderController.store);
router.get('/:id', orderController.show);
router.put('/:id', requireStaffPin, orderController.update);
router.patch('/:id/status', requireStaffPin, orderController.updateStatus);
router.delete('/:id', requireStaffPin, orderController.destroy);

export default router;
