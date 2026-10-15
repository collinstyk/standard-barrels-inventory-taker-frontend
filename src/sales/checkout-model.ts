import type { SaleDetail } from "../api";

export const MAX_QUANTITY = 2_147_483_647;
export type BasketLine = {
  id: string;
  productId: string;
  productName: string;
  unitId: number;
  unitName: string;
  sku: string;
  warehouseId: string;
  quantity: string;
  handover: string;
  price: string;
};
export type Basket = {
  buyerId: string;
  buyerName: string;
  amountPaid: string;
  lines: BasketLine[];
};
export type CreateSalePayload = {
  buyerId: string | null;
  transactionStatus: "PENDING";
  amountPaid: string;
  extraCost: string;
  items: Array<{
    productId: string;
    unitId: number;
    quantityOrdered: number;
    quantityDelivered: 0;
    confirmedUnitSalePrice: string;
    fulfillments: Array<{ warehouseId: number; quantityInOrderUnit: number }>;
  }>;
};
export type DispatchPayload = {
  lines: Array<{ fulfillmentId: number; quantityInOrderUnit: number }>;
};
export type CheckoutAttempt = {
  version: 1;
  userId: string;
  basket: Basket;
  phase: "creating" | "created" | "dispatching" | "confirmed";
  create: { key: string; payload: CreateSalePayload };
  saleId?: number;
  dispatch?: { key: string; payload: DispatchPayload };
};

// All financial arithmetic uses four-place fixed-point integers, matching the API input precision.
export function decimal(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
}
export function decimalString(value: bigint): string {
  if (value < 0n) return `-${decimalString(-value)}`;
  const fraction = (value % 10_000n)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  return `${value / 10_000n}${fraction ? `.${fraction}` : ""}`;
}
export function quantity(value: string, allowZero = false): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) &&
    number >= (allowZero ? 0 : 1) &&
    number <= MAX_QUANTITY
    ? number
    : null;
}
export function lineError(line: BasketLine): string {
  const ordered = quantity(line.quantity);
  const handover = quantity(line.handover, true);
  if (ordered === null) return "Enter a whole ordered quantity of at least 1.";
  if (handover === null || handover > ordered)
    return "Hand over now must be between 0 and the ordered quantity.";
  if (decimal(line.price) === null)
    return "Enter a valid price with at most four decimal places.";
  if (quantity(line.warehouseId) === null)
    return "Choose a warehouse for this product.";
  return "";
}
export function lineTotal(line: BasketLine): bigint | null {
  const price = decimal(line.price),
    ordered = quantity(line.quantity);
  return price === null || ordered === null ? null : price * BigInt(ordered);
}
export function basketTotal(lines: BasketLine[]): bigint {
  return lines.reduce((sum, line) => sum + (lineTotal(line) ?? 0n), 0n);
}
export function basketError(basket: Basket): string {
  if (!basket.lines.length) return "Add at least one product.";
  const seen = new Set<string>();
  for (const line of basket.lines) {
    const key = `${line.productId}:${line.unitId}`;
    if (seen.has(key))
      return "This product and unit are already in the basket. Adjust its existing line.";
    seen.add(key);
    const error = lineError(line);
    if (error) return error;
  }
  return "";
}
export function paymentError(basket: Basket): string {
  const paid = decimal(basket.amountPaid);
  if (paid === null)
    return "Enter the amount already received, or 0 if unpaid.";
  if (paid > basketTotal(basket.lines))
    return "Amount paid exceeds the sale total. Check the amount before continuing.";
  return "";
}
export function createPayload(basket: Basket): CreateSalePayload {
  const error = basketError(basket) || paymentError(basket);
  if (error) throw new Error(error);
  return {
    buyerId: basket.buyerId || null,
    transactionStatus: "PENDING",
    amountPaid: basket.amountPaid,
    extraCost: "0",
    items: basket.lines.map((line) => ({
      productId: line.productId,
      unitId: line.unitId,
      quantityOrdered: quantity(line.quantity)!,
      quantityDelivered: 0,
      confirmedUnitSalePrice: line.price,
      fulfillments: [
        {
          warehouseId: quantity(line.warehouseId)!,
          quantityInOrderUnit: quantity(line.quantity)!,
        },
      ],
    })),
  };
}
export function dispatchPayload(
  basket: Basket,
  sale: SaleDetail,
): DispatchPayload {
  if (
    sale.transactionStatus === "DRAFT" ||
    sale.transactionStatus === "CANCELLED"
  )
    throw new Error(
      "The saved sale is not active. Review it before handing over goods.",
    );
  return {
    lines: basket.lines
      .filter((line) => quantity(line.handover, true)! > 0)
      .map((line) => {
        const matches = sale.items.filter(
          (item) =>
            item.product.id === line.productId && item.unit.id === line.unitId,
        );
        if (matches.length !== 1)
          throw new Error(
            "The saved sale lines do not match this basket. No handover was submitted.",
          );
        const item = matches[0];
        if (item.quantityDelivered !== 0)
          throw new Error(
            "This sale already has a handover. Review its delivery history before recording more goods.",
          );
        const fulfillment = item.fulfillments.find(
          (fulfillment) =>
            fulfillment.warehouse.id === quantity(line.warehouseId),
        );
        if (
          !fulfillment ||
          fulfillment.quantityInOrderUnit < quantity(line.handover, true)!
        )
          throw new Error(
            "The saved warehouse plan does not match this handover. No handover was submitted.",
          );
        return {
          fulfillmentId: fulfillment.id,
          quantityInOrderUnit: quantity(line.handover, true)!,
        };
      }),
  };
}

export interface CheckoutIO {
  create(payload: CreateSalePayload, key: string): Promise<{ id: number }>;
  read(saleId: number): Promise<SaleDetail>;
  dispatch(
    saleId: number,
    payload: DispatchPayload,
    key: string,
  ): Promise<unknown>;
  save(attempt: CheckoutAttempt): void;
  newKey(): string;
}

// Every acknowledged boundary is persisted before the next command. Resuming never
// generates a second sale or a new key for an ambiguous dispatch.
export async function runCheckout(
  initial: CheckoutAttempt,
  io: CheckoutIO,
): Promise<SaleDetail> {
  let attempt = structuredClone(initial);
  const save = (next: CheckoutAttempt) => {
    io.save(next);
    attempt = next;
  };
  if (attempt.phase === "creating") {
    const result = await io.create(attempt.create.payload, attempt.create.key);
    if (!Number.isSafeInteger(result.id) || result.id < 1)
      throw new Error(
        "The server did not return a valid sale ID. Retry this confirmation to recover its result.",
      );
    save({ ...attempt, saleId: result.id, phase: "created" });
  }
  if (!attempt.saleId)
    throw new Error(
      "The saved sale ID is missing. Keep this confirmation for recovery.",
    );
  if (attempt.phase === "created") {
    const sale = await io.read(attempt.saleId);
    const payload = dispatchPayload(attempt.basket, sale);
    save(
      payload.lines.length
        ? {
            ...attempt,
            phase: "dispatching",
            dispatch: { key: io.newKey(), payload },
          }
        : { ...attempt, phase: "confirmed" },
    );
  }
  if (attempt.phase === "dispatching") {
    if (!attempt.dispatch)
      throw new Error(
        "The handover request is missing. Review the saved sale.",
      );
    await io.dispatch(
      attempt.saleId!,
      attempt.dispatch.payload,
      attempt.dispatch.key,
    );
    save({ ...attempt, phase: "confirmed" });
  }
  return io.read(attempt.saleId!);
}
