import { Router } from 'express';
import { requireStaffPin } from '../middlewares/staffAuth';
import { listKitchenOrders, listTableOrders } from '../controllers/kitchenController';

const router = Router();

// Painel da cozinha: só a equipe (PIN), quando KITCHEN_PIN estiver definido.
router.use(requireStaffPin);

router.get('/', listKitchenOrders);
router.get('/table/:tableNumber', listTableOrders);

export default router;
