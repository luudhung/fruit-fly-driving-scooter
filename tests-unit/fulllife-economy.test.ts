import test from "node:test";
import assert from "node:assert/strict";
import { EconomyLedger } from "../src/fulllife-economy.ts";

test("FC is conserved across work and store transfers", () => {
  const ledger = new EconomyLedger(120);
  const fly = ledger.ensureFly("FLY-000001");
  assert.equal(ledger.transfer(10, "TREASURY", fly, 4, "crate-delivery"), true);
  assert.equal(ledger.transfer(20, fly, "STORE", 1, "food-machine"), true);
  assert.equal(ledger.balance(fly), 3);
  assert.equal(ledger.balance("TREASURY"), 116);
  assert.equal(ledger.balance("STORE"), 1);
  assert.equal(ledger.totalSupply(), 120);
  ledger.assertConserved();
});

test("overspending is rejected without minting or negative balances", () => {
  const ledger = new EconomyLedger(5);
  const fly = ledger.ensureFly("FLY-000002");
  assert.equal(ledger.transfer(1, fly, "STORE", 1, "attempt"), false);
  assert.equal(ledger.balance(fly), 0);
  assert.equal(ledger.totalSupply(), 5);
  ledger.assertConserved();
});
