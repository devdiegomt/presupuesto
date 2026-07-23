import type { Currency } from './types';

const MINOR_UNITS: Record<Currency, number> = {
  COP: 1,
  BRL: 100,
};

export function toMinor(amount: number, currency: Currency): number {
  const factor = MINOR_UNITS[currency];
  return Math.round(amount * factor);
}

export function fromMinor(amountMinor: number, currency: Currency): number {
  const factor = MINOR_UNITS[currency];
  return amountMinor / factor;
}

const formatters: Record<Currency, Intl.NumberFormat> = {
  COP: new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }),
  BRL: new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }),
};

export function formatMoney(amountMinor: number, currency: Currency): string {
  return formatters[currency].format(fromMinor(amountMinor, currency));
}
