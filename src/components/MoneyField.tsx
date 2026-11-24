import type { Trip } from '../db/types';
import { convert, currencyInfo, formatMoney, isForeign, JPY, parseMoneyInput, tripCurrency } from '../lib/currency';

type Props = {
  trip: Pick<Trip, 'currency' | 'rate'>;
  label: string;
  value: string;
  currency: string;
  onChange: (v: string) => void;
  onCurrencyChange: (c: string) => void;
  placeholder?: string;
};

/** 金額の入力欄。海外の旅行では「現地通貨／円」を切り替えて入れられ、もう片方の通貨での額も出す */
export function MoneyField({ trip, label, value, currency, onChange, onCurrencyChange, placeholder }: Props) {
  const local = tripCurrency(trip);
  const foreign = isForeign(trip);
  const info = currencyInfo(currency);
  const num = parseMoneyInput(value, currency);
  const other = currency === JPY ? local : JPY;

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="money-field">
        <span className="money-symbol">{info.symbol.trim()}</span>
        <input
          inputMode={info.decimals > 0 ? 'decimal' : 'numeric'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
        />
        {foreign && (
          <div className="seg seg-small money-cur" role="radiogroup" aria-label={`${label}の通貨`}>
            {[local, JPY].map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === currency}
                className={c === currency ? 'active' : ''}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onCurrencyChange(c)}
              >
                {c === JPY ? '円' : c}
              </button>
            ))}
          </div>
        )}
      </div>
      {foreign && num !== undefined && !Number.isNaN(num) && num > 0 && (
        <span className="hint">≈ {formatMoney(convert(num, currency, other, trip), other)}</span>
      )}
    </div>
  );
}
