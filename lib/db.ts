
// FIX: Switched to a default import for Dexie. The named import `{ Dexie }` was incorrect
// and prevented the AppDB class from properly inheriting Dexie's methods like 'version' and 'transaction'.
import Dexie, { type Table } from 'dexie';
import type { Party, LedgerEntry } from '../types';

export class AppDB extends Dexie {
  parties!: Table<Party>;
  entries!: Table<LedgerEntry>;

  constructor() {
    super('OkLedgerDB');
    this.version(1).stores({
      parties: '++id, name, phone, type, balance',
      entries: '++id, partyId, date, createdAt',
    });
  }
}

export const db = new AppDB();

export const recalculateBalancesForParty = async (partyId: number) => {
  await db.transaction('rw', db.parties, db.entries, async () => {
    const entries = await db.entries
      .where({ partyId })
      .sortBy('date')
      // Use createdAt as a tie-breaker for entries on the same day
      .then(items => items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime()));

    let runningBalance = 0;
    const updates: Promise<any>[] = [];

    for (const entry of entries) {
      const entryAmount = entry.direction === 'credit' ? entry.amount : -entry.amount;
      runningBalance += entryAmount;
      if (entry.balanceAfter !== runningBalance) {
        updates.push(db.entries.update(entry.id!, { balanceAfter: runningBalance }));
      }
    }

    await Promise.all(updates);
    
    const party = await db.parties.get(partyId);
    if (party && party.balance !== runningBalance) {
        await db.parties.update(partyId, { balance: runningBalance, updatedAt: new Date() });
    } else if (party && entries.length === 0) {
        // Handle case where all entries are deleted
        await db.parties.update(partyId, { balance: 0, updatedAt: new Date() });
    }
  });
};
