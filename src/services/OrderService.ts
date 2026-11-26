import { randomUUID } from 'node:crypto';
import { Order, OrderItem, OrderStatus, PaymentMethod } from '../models/Order';
import { IOrderRepository, OrderChanges } from '../repositories/orderRepository';
import { IProductRepository } from '../repositories/productRepository';
import { PricingService } from './PricingService';
import { ConflictError, NotFoundError, ValidationError } from '../errors/HttpError';
import { isValidUuid } from '../utils/uuid';

/** Item como chega no corpo da requisição (ainda não validado). */
export interface OrderItemInput {
  productId?: unknown;
  quantity?: unknown;
  options?: unknown;
}

export interface CreateOrderInput {
  customerName: string;
  tableNumber: number;
  items: unknown;
  paymentMethod?: unknown;
}

export interface UpdateOrderInput {
  customerName?: string;
  tableNumber?: number;
  items?: unknown;
  paymentMethod?: unknown;
}

/**
 * Regras de negócio de pedidos:
 * - o pedido precisa ter de 1 a 50 itens, cada um com quantidade inteira de 1 a 99;
 * - só entram produtos existentes e disponíveis (isAvailable = true);
 * - preço unitário, subtotal e total são calculados no servidor (PricingService);
 * - formas de pagamento aceitas: PIX, Cartão ou Dinheiro (padrão: Dinheiro), sempre "Aguardando no caixa";
 * - todo pedido nasce com status "Recebido" e só aceita os status Recebido, Preparando, Pronto e Entregue;
 * - um pedido só pode ser editado (PUT) enquanto está "Recebido", antes de a cozinha começar o preparo;
 * - a cozinha vê apenas pedidos que ainda não foram entregues.
 */
export class OrderService {
  static readonly NOT_FOUND = 'Pedido não encontrado.';
  static readonly MAX_ITEMS_PER_ORDER = 50;
  static readonly MAX_QUANTITY_PER_ITEM = 99;
  static readonly STATUSES: readonly OrderStatus[] = ['Recebido', 'Preparando', 'Pronto', 'Entregue'];
  static readonly PAYMENT_METHODS: readonly PaymentMethod[] = ['PIX', 'Cartão', 'Dinheiro'];
  static readonly EDITABLE_STATUS: OrderStatus = 'Recebido';

  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly productRepository: IProductRepository,
    private readonly pricing: PricingService = new PricingService()
  ) {}

  static isValidStatus(value: unknown): value is OrderStatus {
    return typeof value === 'string' && (OrderService.STATUSES as readonly string[]).includes(value);
  }

  static isValidPaymentMethod(value: unknown): value is PaymentMethod {
    return typeof value === 'string' && (OrderService.PAYMENT_METHODS as readonly string[]).includes(value);
  }

  /** Soma os subtotais dos itens, com arredondamento monetário. */
  static calculateTotal(items: Pick<OrderItem, 'subtotal'>[]): number {
    return PricingService.roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
  }

  async list(): Promise<Order[]> {
    return this.orderRepository.findAll();
  }

  async getById(id: string): Promise<Order> {
    const order = await this.orderRepository.findById(id);
    if (!order) throw new NotFoundError(OrderService.NOT_FOUND);
    return order;
  }

  async listForKitchen(): Promise<Order[]> {
    const orders = await this.orderRepository.findAll();
    return orders.filter((order) => order.status !== 'Entregue');
  }

  async listByTable(tableNumber: number): Promise<Order[]> {
    if (!Number.isInteger(tableNumber) || tableNumber < 1) throw new ValidationError('Número da mesa é inválido.');
    const orders = await this.orderRepository.findAll();
    return orders.filter((order) => order.tableNumber === tableNumber);
  }

  async create(input: CreateOrderInput): Promise<Order> {
    const paymentMethod = this.parsePaymentMethod(input.paymentMethod ?? 'Dinheiro');
    const items = await this.buildItems(input.items);

    const order: Order = {
      id: randomUUID(),
      customerName: input.customerName,
      tableNumber: input.tableNumber,
      status: 'Recebido',
      items,
      total: OrderService.calculateTotal(items),
      createdAt: new Date().toISOString(),
      paymentMethod,
      paymentStatus: 'Aguardando no caixa'
    };

    return this.orderRepository.create(order);
  }

  async update(id: string, input: UpdateOrderInput): Promise<Order> {
    const changes: OrderChanges = {};
    if (input.customerName !== undefined) changes.customerName = input.customerName;
    if (input.tableNumber !== undefined) changes.tableNumber = input.tableNumber;
    if (input.paymentMethod !== undefined) changes.paymentMethod = this.parsePaymentMethod(input.paymentMethod);

    if (Object.keys(changes).length === 0 && input.items === undefined) {
      throw new ValidationError('Informe ao menos um campo para atualizar (customerName, tableNumber, paymentMethod ou items).');
    }

    const current = await this.getById(id);
    if (current.status !== OrderService.EDITABLE_STATUS) {
      throw new ConflictError(`O pedido só pode ser alterado enquanto está "${OrderService.EDITABLE_STATUS}" (status atual: ${current.status}).`);
    }

    if (input.items !== undefined) {
      changes.items = await this.buildItems(input.items);
      changes.total = OrderService.calculateTotal(changes.items);
    }

    const updated = await this.orderRepository.update(id, changes);
    if (!updated) throw new NotFoundError(OrderService.NOT_FOUND);
    return updated;
  }

  async updateStatus(id: string, status: unknown): Promise<Order> {
    if (!OrderService.isValidStatus(status)) {
      throw new ValidationError(`Status do pedido inválido. Use: ${OrderService.STATUSES.join(', ')}.`);
    }

    const updated = await this.orderRepository.updateStatus(id, status);
    if (!updated) throw new NotFoundError(OrderService.NOT_FOUND);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const removed = await this.orderRepository.remove(id);
    if (!removed) throw new NotFoundError(OrderService.NOT_FOUND);
  }

  private parsePaymentMethod(value: unknown): PaymentMethod {
    if (!OrderService.isValidPaymentMethod(value)) {
      throw new ValidationError(`Método de pagamento inválido. Use: ${OrderService.PAYMENT_METHODS.join(', ')}.`);
    }
    return value;
  }

  /** Valida os itens recebidos e monta os itens do pedido com preços calculados no servidor. */
  private async buildItems(items: unknown): Promise<OrderItem[]> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('O pedido deve ter ao menos um item (items deve ser uma lista).');
    }
    if (items.length > OrderService.MAX_ITEMS_PER_ORDER) {
      throw new ValidationError(`O pedido pode ter no máximo ${OrderService.MAX_ITEMS_PER_ORDER} itens.`);
    }

    return Promise.all(items.map((item: unknown, index) => this.buildItem(item, index + 1)));
  }

  private async buildItem(raw: unknown, position: number): Promise<OrderItem> {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ValidationError(`O item ${position} do pedido deve ser um objeto.`);
    }
    const item = raw as OrderItemInput;

    const quantity = Number(item.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > OrderService.MAX_QUANTITY_PER_ITEM) {
      throw new ValidationError(`A quantidade do item ${position} deve ser um inteiro entre 1 e ${OrderService.MAX_QUANTITY_PER_ITEM}.`);
    }

    if (typeof item.productId !== 'string' || !isValidUuid(item.productId)) {
      throw new ValidationError(`O productId do item ${position} deve ser um UUID válido.`);
    }

    if (item.options !== undefined && !Array.isArray(item.options)) {
      throw new ValidationError(`O campo options do item ${position} deve ser uma lista de textos.`);
    }

    const product = await this.productRepository.findById(item.productId);
    if (!product || !product.isAvailable) {
      throw new ValidationError(`Produto do item ${position} não encontrado ou indisponível.`);
    }

    const options = Array.isArray(item.options)
      ? item.options.filter((option: unknown): option is string => typeof option === 'string')
      : [];
    const unitPrice = this.pricing.calculateUnitPrice(product, options);

    return {
      id: randomUUID(),
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      subtotal: PricingService.roundMoney(quantity * unitPrice),
      options
    };
  }
}
