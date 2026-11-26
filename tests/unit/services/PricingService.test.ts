import { describe, expect, it } from 'vitest';
import { PricingService } from '../../../src/services/PricingService';

const pricing = new PricingService();
const product = (name: string, price: number) => ({ name, price });

describe('PricingService (unitário)', () => {
  it('roundMoney arredonda para 2 casas', () => {
    expect(PricingService.roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(PricingService.roundMoney(47.900000000000006)).toBe(47.9);
  });

  describe('pratos', () => {
    it('mantém o preço base sem adicionais', () => {
      expect(pricing.calculateUnitPrice(product('Spaghetti Carbonara', 42.9), [])).toBe(42.9);
    });

    it('soma os adicionais de prato', () => {
      expect(pricing.calculateUnitPrice(product('Spaghetti Carbonara', 42.9), ['Bacon crocante', 'Parmesão ralado na hora'])).toBe(50.9);
    });

    it('rejeita adicional de outra categoria e nomes herdados do Object (400)', () => {
      expect(() => pricing.calculateUnitPrice(product('Penne al Pomodoro', 36.5), ['Chantilly'])).toThrowError('Adicional de prato inválido.');
      expect(() => pricing.calculateUnitPrice(product('Penne al Pomodoro', 36.5), ['toString'])).toThrowError(/inválido/);
    });
  });

  describe('vinhos', () => {
    it('taça de vinho custa R$ 18,00', () => {
      expect(pricing.calculateUnitPrice(product('Chianti Classico', 64.9), ['Taça de vinho'])).toBe(PricingService.WINE_GLASS_PRICE);
    });

    it('garrafa mantém o preço do produto', () => {
      expect(pricing.calculateUnitPrice(product('Chianti Classico', 64.9), ['Garrafa de vinho'])).toBe(64.9);
    });

    it('rejeita adicional que não é de vinho', () => {
      expect(() => pricing.calculateUnitPrice(product('Prosecco Veneto', 72.9), ['Bacon crocante'])).toThrowError('Adicional inválido para vinho.');
    });
  });

  describe('refrigerantes', () => {
    it('lata custa R$ 7,50 e soma gelo e limão', () => {
      expect(pricing.calculateUnitPrice(product('Coca-Cola 600ml', 9.5), ['Lata 350 ml', 'Copo com gelo', 'Com limão'])).toBe(10);
    });

    it('garrafa com laranja soma R$ 1,00', () => {
      expect(pricing.calculateUnitPrice(product('Fanta Laranja 600ml', 9.5), ['Garrafa 600 ml', 'Com laranja'])).toBe(10.5);
    });

    it('rejeita adicional de vinho em refrigerante', () => {
      expect(() => pricing.calculateUnitPrice(product('Guaraná Antarctica 600ml', 9.5), ['Taça de vinho'])).toThrowError('Adicional inválido para refrigerante.');
    });
  });

  describe('sobremesas', () => {
    it('soma os adicionais de sobremesa', () => {
      expect(pricing.calculateUnitPrice(product('Tiramisu', 21.9), ['Chantilly', 'Raspas de amêndoas'])).toBe(28.9);
    });

    it('rejeita adicional de prato em sobremesa', () => {
      expect(() => pricing.calculateUnitPrice(product('Tiramisu', 21.9), ['Bacon crocante'])).toThrowError('Adicional de sobremesa inválido.');
    });
  });
});
