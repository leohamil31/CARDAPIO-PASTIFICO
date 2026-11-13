import { Router } from 'express';
import { validateIdParam } from '../utils/validation';
import { destroyOrder, listOrders, showOrder, storeOrder, updateOrderStatusController } from '../controllers/orderController';
import { listKitchenOrders, listTableOrders } from '../controllers/kitchenController';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', listOrders);
router.get('/kitchen', listKitchenOrders);
router.get('/table/:tableNumber', listTableOrders);
router.post('/', storeOrder);
router.get('/:id', showOrder);
router.patch('/:id/status', updateOrderStatusController);
router.delete('/:id', destroyOrder);

export default router;
