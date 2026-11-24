import { db } from './db';
import type { Repayment } from './types';
import { newId } from '../lib/id';

/** 精算で渡したお金を記録する（全額でも一部でも） */
export async function addRepayment(r: Omit<Repayment, 'id'>): Promise<void> {
  await db.repayments.add({ ...r, id: newId() });
}

export async function deleteRepayment(id: string): Promise<void> {
  await db.repayments.delete(id);
}
