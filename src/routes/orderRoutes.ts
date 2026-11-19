import { Router } from 'express';
import { requireStaffPin } from '../middlewares/staffAuth';
import { validateIdParam } from '../utils/validation';
import { destroyOrder, listOrders, showOrder, storeOrder, updateOrderStatusController } from '../controllers/orderController';
import { listKitchenOrders, listTableOrders } from '../controllers/kitchenController';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', requireStaffPin, listOrders);
router.get('/kitchen', requireStaffPin, listKitchenOrders);
router.get('/table/:tableNumber', requireStaffPin, listTableOrders);
router.post('/', storeOrder);
router.get('/:id', showOrder);
router.patch('/:id/status', requireStaffPin, updateOrderStatusController);
router.delete('/:id', requireStaffPin, destroyOrder);

export default router;
