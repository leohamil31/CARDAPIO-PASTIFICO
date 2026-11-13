import { Router } from 'express';
import { validateIdParam } from '../utils/validation';
import { destroyProduct, listProducts, showProduct, storeProduct, updateProductController } from '../controllers/productController';

const router = Router();

// Todo `:id` destas rotas precisa ser UUID; caso contrário responde 400.
router.param('id', validateIdParam);

router.get('/', listProducts);
router.get('/:id', showProduct);
router.post('/', storeProduct);
router.put('/:id', updateProductController);
router.delete('/:id', destroyProduct);

export default router;
