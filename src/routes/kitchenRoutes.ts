import { Router } from 'express';
import { requireStaffPin } from '../middlewares/staffAuth';
import { kitchenController } from '../container';

const router = Router();

// Painel da cozinha: só a equipe (PIN), quando KITCHEN_PIN estiver definido.
router.use(requireStaffPin);

router.get('/', kitchenController.openOrders);
router.get('/table/:tableNumber', kitchenController.tableOrders);

export default router;
