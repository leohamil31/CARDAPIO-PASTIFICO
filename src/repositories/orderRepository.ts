import { randomUUID } from 'node:crypto';
import { Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus } from '../models/Order';
import { isSupabaseConfigured, requireSupabaseClient } from '../config/supabaseClient';
import { ensureDatabaseFile, saveDatabase } from '../config/localDatabase';
import { productRepository } from './productRepository';
import { isValidUuid } from '../utils/uuid';
import { HttpError } from '../middlewares/errorHandler';

/** Formato de cada item recebido no corpo de POST /orders. */
export interface OrderItemInput {
  productId: string;
  quantity?: number | string;
  options?: unknown;
}

interface OrderItemRow {
  id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number | string;
  subtotal: number | string;
  options: string[] | null;
}

interface OrderRow {
  id: string;
  customer_name: string;
  table_number: number;
  status: string;
  total: number | string;
  created_at: string;
  payment_method: PaymentMethod | null;
  payment_status: string | null;
  order_items?: OrderItemRow[];
}

const MAX_QUANTITY_PER_ITEM = 99;

/** Arredonda valores monetários para 2 casas, evitando 0.1 + 0.2 = 0.30000000000000004. */
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const foodOptionPrices: Record<string, number> = {
  'Molho extra da casa': 4,
  'Parmesão ralado na hora': 3,
  'Bacon crocante': 5,
  'Frango grelhado': 8,
  'Pimenta calabresa': 2
};

const dessertOptionPrices: Record<string, number> = {
  'Calda de chocolate extra': 3,
  'Chantilly': 3,
  'Raspas de amêndoas': 4
};

const wineProductNames = new Set(['Vinho Toscano', 'Chianti Classico', 'Pinot Grigio delle Venezie', 'Prosecco Veneto', 'Montepulciano d’Abruzzo']);
const sodaProductNames = new Set(['Coca-Cola 600ml', 'Guaraná Antarctica 600ml', 'Fanta Laranja 600ml']);
const dessertProductNames = new Set(['Tiramisu', 'Panna Cotta', 'Cannoli', 'Pavê de Chocolate', 'Torta de Ricota', 'Affogato']);

const getAuthoritativeItemPrice = (productName: string, basePrice: number, options: string[]): number => {
  let price = basePrice;

  if (wineProductNames.has(productName)) {
    if (options.some((option) => !['Taça de vinho', 'Garrafa de vinho'].includes(option))) throw new HttpError(400, 'Adicional inválido para vinho.');
    if (options.includes('Taça de vinho')) price = 18;
    return price;
  }

  if (sodaProductNames.has(productName)) {
    const allowed = ['Lata 350 ml', 'Garrafa 600 ml', 'Copo com gelo', 'Com limão', 'Com laranja'];
    if (options.some((option) => !allowed.includes(option))) throw new HttpError(400, 'Adicional inválido para refrigerante.');
    if (options.includes('Lata 350 ml')) price = 7.5;
    return price + (options.includes('Copo com gelo') ? 1.5 : 0) + (options.includes('Com limão') ? 1 : 0) + (options.includes('Com laranja') ? 1 : 0);
  }

  if (dessertProductNames.has(productName)) {
    const extras = options.reduce((total, option) => {
      if (!Object.prototype.hasOwnProperty.call(dessertOptionPrices, option)) throw new HttpError(400, 'Adicional de sobremesa inválido.');
      return total + dessertOptionPrices[option];
    }, 0);
    return price + extras;
  }

  const extras = options.reduce((total, option) => {
    if (!Object.prototype.hasOwnProperty.call(foodOptionPrices, option)) throw new HttpError(400, 'Adicional de prato inválido.');
    return total + foodOptionPrices[option];
  }, 0);
  return price + extras;
};

const mapOrder = (row: OrderRow): Order => ({
  id: row.id,
  customerName: row.customer_name,
  tableNumber: row.table_number,
  status: row.status as OrderStatus,
  total: Number(row.total),
  createdAt: row.created_at,
  paymentMethod: row.payment_method ?? 'Dinheiro',
  paymentStatus: row.payment_status === 'Pago' ? 'Pago' : 'Aguardando no caixa',
  items: (row.order_items ?? []).map((item): OrderItem => ({
    id: item.id,
    productId: item.product_id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    subtotal: Number(item.subtotal),
    options: item.options ?? []
  }))
});

const findAllLocal = (): Order[] => ensureDatabaseFile().orders;

const persistLocal = (orders: Order[]): void => {
  const db = ensureDatabaseFile();
  saveDatabase({ ...db, orders });
};

const buildOrderItems = async (items: OrderItemInput[]): Promise<OrderItem[]> => Promise.all(items.map(async (item, index) => {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    throw new HttpError(400, `O item ${index + 1} do pedido deve ser um objeto.`);
  }

  const quantity = Number(item.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
    throw new HttpError(400, `A quantidade do item ${index + 1} deve ser um inteiro entre 1 e ${MAX_QUANTITY_PER_ITEM}.`);
  }

  if (typeof item.productId !== 'string' || !isValidUuid(item.productId)) {
    throw new HttpError(400, `O productId do item ${index + 1} deve ser um UUID válido.`);
  }

  const product = await productRepository.findById(item.productId);
  if (!product || !product.isAvailable) throw new HttpError(400, `Produto do item ${index + 1} não encontrado ou indisponível.`);

  if (item.options !== undefined && !Array.isArray(item.options)) {
    throw new HttpError(400, `O campo options do item ${index + 1} deve ser uma lista de textos.`);
  }
  const options = Array.isArray(item.options) ? item.options.filter((option: unknown): option is string => typeof option === 'string') : [];
  const unitPrice = roundMoney(getAuthoritativeItemPrice(product.name, product.price, options));
  const subtotal = roundMoney(quantity * unitPrice);

  return {
    id: randomUUID(),
    productId: product.id,
    name: product.name,
    quantity,
    unitPrice,
    subtotal,
    options
  };
}));

export const orderRepository = {
  async findAll(): Promise<Order[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient().from('orders').select('*, order_items(*)').order('created_at');
      if (error) throw error;
      return (data ?? []).map(mapOrder);
    }
    return findAllLocal();
  },

  async findById(id: string): Promise<Order | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? mapOrder(data) : undefined;
    }
    return findAllLocal().find((order) => order.id === id);
  },

  async findForKitchen(): Promise<Order[]> {
    const orders = await this.findAll();
    return orders.filter((order) => order.status !== 'Entregue');
  },

  async findByTable(tableNumber: number): Promise<Order[]> {
    const orders = await this.findAll();
    return orders.filter((order) => order.tableNumber === tableNumber);
  },

  async create(customerName: string, tableNumber: number, items: OrderItemInput[], paymentMethod: PaymentMethod = 'Dinheiro'): Promise<Order> {
    const orderItems = await buildOrderItems(items);
    const total = roundMoney(orderItems.reduce((sum, item) => sum + item.subtotal, 0));
    const paymentStatus: PaymentStatus = 'Aguardando no caixa';

    if (isSupabaseConfigured()) {
      const supabase = requireSupabaseClient();
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        id: randomUUID(),
        customer_name: customerName,
        table_number: tableNumber,
        status: 'Recebido',
        total,
        payment_method: paymentMethod,
        payment_status: paymentStatus
      }).select().single();
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems.map((item) => ({
        id: item.id,
        order_id: order.id,
        product_id: item.productId,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
        options: item.options ?? []
      })));
      if (itemsError) {
        // Sem transação no PostgREST: desfaz o pedido para não deixar um registro sem itens.
        await supabase.from('orders').delete().eq('id', order.id);
        throw itemsError;
      }

      return {
        ...mapOrder({ ...order, payment_method: paymentMethod, payment_status: paymentStatus, order_items: [] }),
        items: orderItems
      };
    }

    const order: Order = {
      id: randomUUID(),
      customerName,
      tableNumber,
      status: 'Recebido',
      items: orderItems,
      total,
      createdAt: new Date().toISOString(),
      paymentMethod,
      paymentStatus
    };

    const orders = findAllLocal();
    orders.push(order);
    persistLocal(orders);
    return order;
  },

  async updateStatus(id: string, status: OrderStatus): Promise<Order | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from('orders').update({ status }).eq('id', id).select('*, order_items(*)').maybeSingle();
      if (error) throw error;
      return data ? mapOrder(data) : undefined;
    }

    const orders = findAllLocal();
    const order = orders.find((current) => current.id === id);
    if (!order) return undefined;

    order.status = status;
    persistLocal(orders);
    return order;
  },

  async remove(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return false;
      const { error, count } = await requireSupabaseClient().from('orders').delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      return Boolean(count);
    }

    const orders = findAllLocal();
    const index = orders.findIndex((order) => order.id === id);
    if (index === -1) return false;

    orders.splice(index, 1);
    persistLocal(orders);
    return true;
  }
};
