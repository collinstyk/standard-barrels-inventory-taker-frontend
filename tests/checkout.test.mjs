import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/sales/checkout-model.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const {
  decimal,
  decimalString,
  basketTotal,
  basketError,
  paymentError,
  createPayload,
  dispatchPayload,
  runCheckout,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const line = (productId = "oil", unitId = 1) => ({
  id: productId,
  productId,
  productName: productId,
  unitId,
  unitName: "Carton",
  sku: productId,
  warehouseId: "2",
  quantity: "3",
  handover: "1",
  price: "0.1",
});
const basket = () => ({
  buyerId: "",
  buyerName: "Walk-in customer",
  amountPaid: "0.1",
  lines: [line(), line("rice", 2)],
});
const sale = () => ({
  id: 42,
  transactionStatus: "PENDING",
  items: [
    {
      id: 2,
      product: { id: "rice" },
      unit: { id: 2 },
      quantityOrdered: 3,
      quantityDelivered: 0,
      fulfillments: [{ id: 202, warehouse: { id: 2 }, quantityInOrderUnit: 3 }],
    },
    {
      id: 1,
      product: { id: "oil" },
      unit: { id: 1 },
      quantityOrdered: 3,
      quantityDelivered: 0,
      fulfillments: [{ id: 101, warehouse: { id: 2 }, quantityInOrderUnit: 3 }],
    },
  ],
});
const attempt = (b = basket()) => ({
  version: 1,
  userId: "staff",
  basket: b,
  phase: "creating",
  create: { key: "create-key", payload: createPayload(b) },
});
function fixture(initial = attempt()) {
  const state = {
    saved: structuredClone(initial),
    creates: [],
    dispatches: [],
    reads: 0,
  };
  const io = {
    save: (value) => {
      state.saved = structuredClone(value);
    },
    newKey: () => "dispatch-key",
    create: async (payload, key) => {
      state.creates.push({ payload: structuredClone(payload), key });
      return { id: 42 };
    },
    read: async () => {
      state.reads++;
      return sale();
    },
    dispatch: async (id, payload, key) => {
      state.dispatches.push({ id, payload: structuredClone(payload), key });
    },
  };
  return { state, io };
}
test("multiple products use exact decimal totals and creation never delivers stock", () => {
  const b = basket();
  assert.equal(decimalString(basketTotal(b.lines)), "0.6");
  assert.equal(decimal("0.0001"), 1n);
  assert.equal(decimal("0.00001"), null);
  const payload = createPayload(b);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.transactionStatus, "PENDING");
  for (const item of payload.items) {
    assert.equal(item.quantityDelivered, 0);
    assert.equal(item.fulfillments[0].quantityInOrderUnit, 3);
  }
});
test("invalid handover, duplicate products and overpayment cannot confirm", () => {
  const b = basket();
  b.lines[0].handover = "4";
  assert.match(basketError(b), /Hand over/);
  b.lines[0].handover = "1.5";
  assert.match(basketError(b), /Hand over/);
  b.lines[0].handover = "0";
  b.lines.push(line());
  assert.match(basketError(b), /already/);
  b.lines.pop();
  b.amountPaid = "1";
  assert.match(paymentError(b), /exceeds/);
  assert.throws(() => createPayload(b));
  b.lines.pop();
  assert.equal(
    paymentError(b),
    "Amount paid exceeds the sale total. Check the amount before continuing.",
  );
});
test("partial handover matches returned fulfillment IDs, independent of server item order", async () => {
  const a = attempt(),
    { io, state } = fixture(a);
  await runCheckout(a, io);
  assert.equal(state.creates.length, 1);
  assert.equal(state.dispatches.length, 1);
  assert.deepEqual(state.dispatches[0].payload, {
    lines: [
      { fulfillmentId: 101, quantityInOrderUnit: 1 },
      { fulfillmentId: 202, quantityInOrderUnit: 1 },
    ],
  });
  assert.equal(state.saved.phase, "confirmed");
  assert.equal(state.reads, 2);
});
test("ambiguous sale creation retries the exact payload and key", async () => {
  const a = attempt(),
    { io, state } = fixture(a);
  const create = io.create;
  let fail = true;
  io.create = async (p, k) => {
    const result = await create(p, k);
    if (fail) {
      fail = false;
      throw Error("connection lost after save");
    }
    return result;
  };
  await assert.rejects(runCheckout(a, io));
  assert.equal(state.saved.phase, "creating");
  await runCheckout(state.saved, io);
  assert.deepEqual(state.creates[0], state.creates[1]);
  assert.equal(state.dispatches.length, 1);
});
test("ambiguous dispatch retries the same command without creating another sale", async () => {
  const a = attempt(),
    { io, state } = fixture(a);
  const dispatch = io.dispatch;
  let fail = true;
  io.dispatch = async (...args) => {
    await dispatch(...args);
    if (fail) {
      fail = false;
      throw Error("connection lost after dispatch");
    }
  };
  await assert.rejects(runCheckout(a, io));
  assert.equal(state.saved.phase, "dispatching");
  await runCheckout(state.saved, io);
  assert.equal(state.creates.length, 1);
  assert.deepEqual(state.dispatches[0], state.dispatches[1]);
});
test("failure to load final details only retries a read after confirmed dispatch", async () => {
  const a = attempt(),
    { io, state } = fixture(a);
  const read = io.read;
  io.read = async () => {
    if (state.saved.phase === "confirmed") throw Error("read unavailable");
    return read();
  };
  await assert.rejects(runCheckout(a, io));
  assert.equal(state.saved.phase, "confirmed");
  io.read = read;
  await runCheckout(state.saved, io);
  assert.equal(state.creates.length, 1);
  assert.equal(state.dispatches.length, 1);
});
test("all goods due later creates the order without a dispatch", async () => {
  const b = basket();
  b.lines.forEach((l) => (l.handover = "0"));
  const a = attempt(b),
    { io, state } = fixture(a);
  await runCheckout(a, io);
  assert.equal(state.dispatches.length, 0);
  assert.equal(state.saved.phase, "confirmed");
});
test("mismatched warehouses and preexisting delivery stop a new handover", () => {
  const s = sale();
  s.items[0].fulfillments[0].warehouse.id = 9;
  assert.throws(() => dispatchPayload(basket(), s), /warehouse plan/);
  s.items[0].fulfillments[0].warehouse.id = 2;
  s.items[0].quantityDelivered = 1;
  assert.throws(() => dispatchPayload(basket(), s), /already has a handover/);
});
