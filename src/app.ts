import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import categoryRoutes from './routes/categoryRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import kitchenRoutes from './routes/kitchenRoutes';
import { isSupabaseConfigured, requireSupabaseClient } from './config/supabaseClient';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler';
import { openApiSpec } from './docs/openapi';

const app = express();
const publicDir = path.join(process.cwd(), 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(publicDir));

app.get('/api/health', async (_req, res) => {
  const supabaseConfigured = isSupabaseConfigured();
  let database = 'local-json';

  if (supabaseConfigured) {
    const { error } = await requireSupabaseClient().from('categories').select('id').limit(1);
    if (error) {
      console.error('Falha no health check do Supabase:', error);
      res.status(503).json({
        name: 'Pastifico API',
        message: 'A API iniciou, mas não conseguiu acessar o banco Supabase.',
        persistence: 'supabase',
        database: 'unavailable'
      });
      return;
    }
    database = 'connected';
  }

  res.status(200).json({
    name: 'Pastifico API',
    message: 'API de autoatendimento do restaurante Pastifico',
    persistence: supabaseConfigured ? 'supabase' : 'local-json',
    database,
    payments: 'cashier-only',
    endpoints: [
      'GET /categories',
      'GET /categories/:id',
      'POST /categories',
      'PUT /categories/:id',
      'DELETE /categories/:id',
      'GET /products',
      'GET /products/:id',
      'POST /products',
      'PUT /products/:id',
      'DELETE /products/:id',
      'GET /orders',
      'GET /orders/:id',
      'POST /orders',
      'PATCH /orders/:id/status',
      'DELETE /orders/:id',
      'GET /orders/kitchen',
      'GET /orders/table/:tableNumber',
      'GET /api-docs'
    ]
  });
});

// Documentação interativa (Swagger UI carregado via CDN, sem dependências extras no back-end).
app.get('/api-docs/openapi.json', (_req, res) => {
  res.status(200).json(openApiSpec);
});

app.get('/api-docs', (_req, res) => {
  res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pastifico API - Documentação</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/api-docs/openapi.json', dom_id: '#swagger-ui' });
  </script>
</body>
</html>`);
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/kitchen-dashboard', (_req, res) => {
  res.sendFile(path.join(publicDir, 'kitchen.html'));
});

app.get('/order-status', (_req, res) => {
  res.sendFile(path.join(publicDir, 'order-status.html'));
});

app.get('/order-history', (_req, res) => {
  res.sendFile(path.join(publicDir, 'order-history.html'));
});

app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);
app.use('/kitchen', kitchenRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
export default app;
