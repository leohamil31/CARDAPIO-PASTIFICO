import { Product } from '../models/Product';
import { ValidationError } from '../errors/HttpError';

/**
 * Regras de preço do cardápio. O preço de cada item é sempre calculado no
 * servidor (nunca confiamos no valor enviado pelo cliente):
 * - vinhos: "Taça de vinho" custa R$ 18,00; "Garrafa de vinho" mantém o preço do produto;
 * - refrigerantes: "Lata 350 ml" custa R$ 7,50; gelo +1,50; limão +1,00; laranja +1,00;
 * - sobremesas e pratos: cada adicional tem um preço fixo, somado ao preço do produto;
 * - adicionais que não combinam com o produto são rejeitados (400).
 */
export class PricingService {
  static readonly WINE_GLASS_PRICE = 18;
  static readonly SODA_CAN_PRICE = 7.5;

  private static readonly FOOD_OPTIONS: Readonly<Record<string, number>> = {
    'Molho extra da casa': 4,
    'Parmesão ralado na hora': 3,
    'Bacon crocante': 5,
    'Frango grelhado': 8,
    'Pimenta calabresa': 2
  };

  private static readonly DESSERT_OPTIONS: Readonly<Record<string, number>> = {
    'Calda de chocolate extra': 3,
    'Chantilly': 3,
    'Raspas de amêndoas': 4
  };

  private static readonly WINE_OPTIONS = ['Taça de vinho', 'Garrafa de vinho'];
  private static readonly SODA_OPTIONS = ['Lata 350 ml', 'Garrafa 600 ml', 'Copo com gelo', 'Com limão', 'Com laranja'];

  private static readonly WINES = new Set(['Vinho Toscano', 'Chianti Classico', 'Pinot Grigio delle Venezie', 'Prosecco Veneto', 'Montepulciano d’Abruzzo']);
  private static readonly SODAS = new Set(['Coca-Cola 600ml', 'Guaraná Antarctica 600ml', 'Fanta Laranja 600ml']);
  private static readonly DESSERTS = new Set(['Tiramisu', 'Panna Cotta', 'Cannoli', 'Pavê de Chocolate', 'Torta de Ricota', 'Affogato']);

  /** Arredonda valores monetários para 2 casas, evitando 0.1 + 0.2 = 0.30000000000000004. */
  static roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /** Calcula o preço unitário do produto com os adicionais escolhidos. */
  calculateUnitPrice(product: Pick<Product, 'name' | 'price'>, options: string[]): number {
    if (PricingService.WINES.has(product.name)) return PricingService.roundMoney(this.winePrice(product.price, options));
    if (PricingService.SODAS.has(product.name)) return PricingService.roundMoney(this.sodaPrice(product.price, options));
    if (PricingService.DESSERTS.has(product.name)) {
      return PricingService.roundMoney(product.price + this.sumExtras(options, PricingService.DESSERT_OPTIONS, 'Adicional de sobremesa inválido.'));
    }
    return PricingService.roundMoney(product.price + this.sumExtras(options, PricingService.FOOD_OPTIONS, 'Adicional de prato inválido.'));
  }

  private winePrice(basePrice: number, options: string[]): number {
    if (options.some((option) => !PricingService.WINE_OPTIONS.includes(option))) {
      throw new ValidationError('Adicional inválido para vinho.');
    }
    return options.includes('Taça de vinho') ? PricingService.WINE_GLASS_PRICE : basePrice;
  }

  private sodaPrice(basePrice: number, options: string[]): number {
    if (options.some((option) => !PricingService.SODA_OPTIONS.includes(option))) {
      throw new ValidationError('Adicional inválido para refrigerante.');
    }
    const price = options.includes('Lata 350 ml') ? PricingService.SODA_CAN_PRICE : basePrice;
    return price
      + (options.includes('Copo com gelo') ? 1.5 : 0)
      + (options.includes('Com limão') ? 1 : 0)
      + (options.includes('Com laranja') ? 1 : 0);
  }

  private sumExtras(options: string[], table: Readonly<Record<string, number>>, errorMessage: string): number {
    return options.reduce((total, option) => {
      // hasOwnProperty evita aceitar nomes herdados como "toString" ou "constructor".
      if (!Object.prototype.hasOwnProperty.call(table, option)) throw new ValidationError(errorMessage);
      return total + table[option];
    }, 0);
  }
}
