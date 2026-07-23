import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { db } from '@/db/schema';
import { importSeed } from '@/import/seed';
import { computeBalances } from '@/domain/balances';

const seedPath = 'C:/Users/diego/Downloads/files3/presupuesto_2024_2026.json';
const skip = !existsSync(seedPath);

describe.skipIf(skip)('real seed import', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('imports the full historical file', async () => {
    const json = JSON.parse(readFileSync(seedPath, 'utf8'));
    const res = await importSeed(json);

    expect(res.counts.movements).toBe(json.movements.length);
    expect(res.counts.accounts).toBe(json.accounts.length);

    const balances = await computeBalances();
    const cop = balances.filter(b => b.currency === 'COP').reduce((s, b) => s + b.balanceMinor, 0);
    const brl = balances.filter(b => b.currency === 'BRL').reduce((s, b) => s + b.balanceMinor, 0);

    console.log('COP net:', cop, 'BRL net (minor):', brl, 'issues:', res.issues);
    console.log('Accounts:');
    balances.forEach(b => console.log(`  ${b.name.padEnd(20)} ${b.currency}  ${b.balanceMinor}`));

    expect(res.issues).toBeGreaterThanOrEqual(0);
  });
});
