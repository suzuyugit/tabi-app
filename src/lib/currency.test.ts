import { describe, expect, it } from 'vitest';
import { convert, formatMoney, parseMoneyInput, parseRate, toInputValue } from './currency';

describe('currency', () => {
  it('表示', () => {
    expect(formatMoney(1200)).toBe('1,200円');
    expect(formatMoney(1250, 'USD')).toBe('$12.50');
    expect(formatMoney(1200, 'USD')).toBe('$12');
    expect(formatMoney(15000, 'KRW')).toBe('₩15,000');
    expect(formatMoney(-500, 'USD')).toBe('-$5');
  });

  it('入力の解釈（最小単位にする）', () => {
    expect(parseMoneyInput('12.5', 'USD')).toBe(1250);
    expect(parseMoneyInput('１２．０５', 'USD')).toBe(1205);
    expect(parseMoneyInput('12', 'USD')).toBe(1200);
    expect(parseMoneyInput('12.345', 'USD')).toBeNaN();
    expect(parseMoneyInput('1,000', 'KRW')).toBe(1000);
    expect(parseMoneyInput('10.5', 'KRW')).toBeNaN();
    expect(parseMoneyInput('', 'USD')).toBeUndefined();
    expect(toInputValue(1250, 'USD')).toBe('12.50');
    expect(toInputValue(1200, 'USD')).toBe('12');
  });

  it('換算（円 ⇔ 現地通貨）', () => {
    const usd = { currency: 'USD', rate: 150 };
    expect(convert(1250, 'USD', 'JPY', usd)).toBe(1875); // $12.50 → 1,875円
    expect(convert(1500, 'JPY', 'USD', usd)).toBe(1000); // 1,500円 → $10.00
    expect(convert(100, 'JPY', 'JPY', usd)).toBe(100);
    const krw = { currency: 'KRW', rate: 0.108 };
    expect(convert(10000, 'KRW', 'JPY', krw)).toBe(1080);
    expect(convert(100, 'EUR', 'JPY', usd)).toBeNaN();
    expect(convert(100, 'USD', 'JPY', { currency: 'USD' })).toBeNaN();
  });

  it('レート', () => {
    expect(parseRate('150.25')).toBe(150.25);
    expect(parseRate('0')).toBeNaN();
    expect(parseRate('abc')).toBeNaN();
    expect(parseRate('')).toBeUndefined();
  });
});
