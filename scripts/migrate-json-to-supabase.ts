/**
 * Copia o catálogo (e os pedidos) do arquivo local data/pastifico-db.json para o Supabase.
 *
 * Pode ser executado quantas vezes quiser (idempotente):
 * - categorias e produtos são sincronizados pelo NOME (coluna única), e não pelo id —
 *   os ids do arquivo local e os do Supabase são diferentes, então um upsert por id
 *   tentava inserir de novo nomes que já existiam e falhava com "duplicate key";
 * - os ids de categoria/produto usados pelos produtos e itens de pedido são
 *   traduzidos para os ids reais do Supabase.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { PersistedDatabase } from '../src/config/localDatabase';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes da migração.');
}

const database = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'pastifico-db.json'), 'utf8')) as PersistedDatabase;
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const run = async (): Promise<void> => {
  // 1) Categorias: upsert pelo nome e mapa id local → id do Supabase.
  const categoriesResult = await supabase
    .from('categories')
    .upsert(database.categories.map((category) => ({ name: category.name, description: category.description })), { onConflict: 'name' })
    .select('id, name');
  if (categoriesResult.error) throw categoriesResult.error;

  const remoteCategoryByName = new Map(categoriesResult.data.map((row: { id: string; name: string }) => [row.name, row.id]));
  const categoryIdMap = new Map(database.categories.map((category) => [category.id, remoteCategoryByName.get(category.name)]));

  // 2) Produtos: upsert pelo nome, já com o category_id do Supabase.
  const products = database.products
    .filter((product) => categoryIdMap.get(product.categoryId))
    .map((product) => ({
      name: product.name,
      description: product.description,
      price: product.price,
      image: product.image,
      is_available: product.isAvailable,
      category_id: categoryIdMap.get(product.categoryId)
    }));
  const skipped = database.products.length - products.length;

  const productsResult = await supabase.from('products').upsert(products, { onConflict: 'name' }).select('id, name');
  if (productsResult.error) throw productsResult.error;
  const remoteProductByName = new Map(productsResult.data.map((row: { id: string; name: string }) => [row.name, row.id]));
  const productIdMap = new Map(database.products.map((product) => [product.id, remoteProductByName.get(product.name)]));

  // 3) Pedidos (ids de pedido são UUIDs gerados localmente, então o upsert por id é seguro).
  let migratedOrders = 0;
  for (const order of database.orders) {
    const items = order.items
      .map((item) => ({ item, productId: productIdMap.get(item.productId) ?? remoteProductByName.get(item.name) }))
      .filter((entry): entry is { item: typeof entry.item; productId: string } => Boolean(entry.productId));
    if (!items.length) continue;

    const orderResult = await supabase.from('orders').upsert({
      id: order.id,
      customer_name: order.customerName,
      table_number: order.tableNumber,
      status: order.status,
      total: order.total,
      payment_method: order.paymentMethod ?? 'Dinheiro',
      payment_status: order.paymentStatus ?? 'Aguardando no caixa',
      created_at: order.createdAt
    });
    if (orderResult.error) throw orderResult.error;

    const itemsResult = await supabase.from('order_items').upsert(items.map(({ item, productId }) => ({
      id: item.id,
      order_id: order.id,
      product_id: productId,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
      options: Array.isArray(item.options) ? item.options : []
    })));
    if (itemsResult.error) throw itemsResult.error;
    migratedOrders += 1;
  }

  console.log(`Migração concluída: ${categoriesResult.data.length} categorias, ${productsResult.data.length} produtos e ${migratedOrders} pedidos.`);
  if (skipped) console.warn(`${skipped} produto(s) ignorado(s) por apontarem para categoria inexistente.`);
};

run().catch((error: Error) => {
  console.error(`Falha na migração: ${error.message}`);
  process.exitCode = 1;
});
