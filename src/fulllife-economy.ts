export type EconomyAccount = "TREASURY" | "STORE" | `FLY:${string}`;

export type EconomyTransfer = {
  id: number;
  simSecond: number;
  from: EconomyAccount;
  to: EconomyAccount;
  amount: number;
  kind: string;
};

export class EconomyLedger {
  private readonly balances = new Map<EconomyAccount, number>();
  private readonly transfers: EconomyTransfer[] = [];
  private nextId = 1;
  readonly initialSupply: number;

  constructor(initialTreasury: number) {
    if (!Number.isFinite(initialTreasury) || initialTreasury < 0) throw new Error("invalid treasury");
    this.initialSupply = initialTreasury;
    this.balances.set("TREASURY", initialTreasury);
    this.balances.set("STORE", 0);
  }

  ensureFly(id: string) {
    const key: EconomyAccount = `FLY:${id}`;
    if (!this.balances.has(key)) this.balances.set(key, 0);
    return key;
  }

  balance(account: EconomyAccount) {
    return this.balances.get(account) ?? 0;
  }

  transfer(simSecond: number, from: EconomyAccount, to: EconomyAccount, amount: number, kind: string) {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const source = this.balance(from);
    if (source + 1e-9 < amount) return false;
    this.balances.set(from, source - amount);
    this.balances.set(to, this.balance(to) + amount);
    this.transfers.push({ id: this.nextId++, simSecond, from, to, amount, kind });
    return true;
  }

  totalSupply() {
    let total = 0;
    for (const value of this.balances.values()) total += value;
    return total;
  }

  assertConserved(epsilon = 1e-8) {
    const delta = Math.abs(this.totalSupply() - this.initialSupply);
    if (delta > epsilon) throw new Error(`FC conservation violated by ${delta}`);
  }

  recent(limit = 50) {
    return this.transfers.slice(-Math.max(0, limit));
  }
}
