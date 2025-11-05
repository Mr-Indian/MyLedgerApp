
export type PartyType = 'customer' | 'supplier';

export interface Party {
  id?: number;
  type: PartyType;
  name: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
  balance: number;
}

export interface LedgerEntry {
  id?: number;
  partyId: number;
  direction: 'credit' | 'debit';
  amount: number;
  date: Date;
  note?: string;
  balanceAfter: number;
  createdAt: Date;
}
