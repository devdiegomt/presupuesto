import { ulid } from 'ulid';

export function slug(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const newId = () => ulid();

export function budgetId(month: string, subtemaId: string): string {
  return `${month}|${subtemaId}`;
}
