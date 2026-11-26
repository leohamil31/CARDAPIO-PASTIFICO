import { Order, OrderItem, OrderStatus, PaymentMethod } from '../models/Order';
import { isSupabaseConfigured, requireSupabaseClient } from '../config/supabaseClient';
import { ensureDatabaseFile, saveDatabase } from '../config/localDatabase';
import { isValidUuid } from '../utils/uuid';

/** Campos de um pedido que podem ser alterados por PUT /orders/:id. */
export interface OrderChanges {
  customerName?: string;
  tableNumber?: number;
  paymentMethod?: PaymentMethod;
  items?: OrderItem[];
  total?: number;
}

/** Contrato da camada de acesso a dados de pedidos. */
export interface IOrderRepository {
  findAll(): Promise<Order[]>;
  findById(id: string): Promise<Order | undefined>;
  existsWithProduct(productId: string): Promise<boolean>;
  create(order: Order): Promise<Order>;
  update(id: string, changes: OrderChanges): Promise<Order | undefined>;
  updateStatus(id: string, status: OrderStatus): Promise<Order | undefined>;
  remove(id: string): Promise<boolean>;
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

/**
 * Repository de pedidos. Grava o pedido (tabela `orders`) e seus itens
 * (tabela `order_items`, relacionada por chave estrangeira). Cálculo de preços
 * e validações ficam em `OrderService`/`PricingService`.
 */
export class OrderRepository implements IOrderRepository {
  private static readonly TABLE = 'orders';
  private static readonly ITEMS_TABLE = 'order_items';
  private static readonly SELECT_WITH_ITEMS = '*, order_items(*)';

  private static toEntity(row: OrderRow): Order {
    return {
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
    };
  }

  private static toItemRows(orderId: string, items: OrderItem[]): Record<string, unknown>[] {
    return items.map((item) => ({
      id: item.id,
      order_id: orderId,
      product_id: item.productId,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
      options: item.options ?? []
    }));
  }

  private readLocal(): Order[] {
    return ensureDatabaseFile().orders;
  }

  private writeLocal(orders: Order[]): void {
    saveDatabase({ ...ensureDatabaseFile(), orders });
  }

  async findAll(): Promise<Order[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await requireSupabaseClient().from(OrderRepository.TABLE).select(OrderRepository.SELECT_WITH_ITEMS).order('created_at');
      if (error) throw error;
      return (data ?? []).map(OrderRepository.toEntity);
    }
    return this.readLocal();
  }

  async findById(id: string): Promise<Order | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from(OrderRepository.TABLE).select(OrderRepository.SELECT_WITH_ITEMS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? OrderRepository.toEntity(data) : undefined;
    }
    return this.readLocal().find((order) => order.id === id);
  }

  /** Indica se algum pedido já usa o produto (equivale à FK order_items.product_id). */
  async existsWithProduct(productId: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(productId)) return false;
      const { count, error } = await requireSupabaseClient()
        .from(OrderRepository.ITEMS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId);
      if (error) throw error;
      return Boolean(count);
    }
    return this.readLocal().some((order) => order.items.some((item) => item.productId === productId));
  }

  async create(order: Order): Promise<Order> {
    if (isSupabaseConfigured()) {
      const supabase = requireSupabaseClient();
      const { data, error: orderError } = await supabase.from(OrderRepository.TABLE).insert({
        id: order.id,
        customer_name: order.customerName,
        table_number: order.tableNumber,
        status: order.status,
        total: order.total,
        payment_method: order.paymentMethod,
        payment_status: order.paymentStatus
      }).select().single();
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from(OrderRepository.ITEMS_TABLE).insert(OrderRepository.toItemRows(order.id, order.items));
      if (itemsError) {
        // Sem transação no PostgREST: desfaz o pedido para não deixar um registro sem itens.
        await supabase.from(OrderRepository.TABLE).delete().eq('id', order.id);
        throw itemsError;
      }

      return { ...order, createdAt: data.created_at ?? order.createdAt };
    }

    const orders = this.readLocal();
    orders.push(order);
    this.writeLocal(orders);
    return order;
  }

  async update(id: string, changes: OrderChanges): Promise<Order | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const supabase = requireSupabaseClient();

      const row: Record<string, unknown> = {};
      if (changes.customerName !== undefined) row.customer_name = changes.customerName;
      if (changes.tableNumber !== undefined) row.table_number = changes.tableNumber;
      if (changes.paymentMethod !== undefined) row.payment_method = changes.paymentMethod;
      if (changes.total !== undefined) row.total = changes.total;

      const { data, error } = await supabase.from(OrderRepository.TABLE).update(row).eq('id', id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return undefined;

      if (changes.items) {
        const { error: deleteError } = await supabase.from(OrderRepository.ITEMS_TABLE).delete().eq('order_id', id);
        if (deleteError) throw deleteError;
        const { error: insertError } = await supabase.from(OrderRepository.ITEMS_TABLE).insert(OrderRepository.toItemRows(id, changes.items));
        if (insertError) throw insertError;
      }

      return this.findById(id);
    }

    const orders = this.readLocal();
    const order = orders.find((current) => current.id === id);
    if (!order) return undefined;

    Object.assign(order, changes);
    this.writeLocal(orders);
    return order;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order | undefined> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return undefined;
      const { data, error } = await requireSupabaseClient().from(OrderRepository.TABLE).update({ status }).eq('id', id).select(OrderRepository.SELECT_WITH_ITEMS).maybeSingle();
      if (error) throw error;
      return data ? OrderRepository.toEntity(data) : undefined;
    }

    const orders = this.readLocal();
    const order = orders.find((current) => current.id === id);
    if (!order) return undefined;

    order.status = status;
    this.writeLocal(orders);
    return order;
  }

  async remove(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      if (!isValidUuid(id)) return false;
      const { error, count } = await requireSupabaseClient().from(OrderRepository.TABLE).delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      return Boolean(count);
    }

    const orders = this.readLocal();
    const index = orders.findIndex((order) => order.id === id);
    if (index === -1) return false;

    orders.splice(index, 1);
    this.writeLocal(orders);
    return true;
  }
}
