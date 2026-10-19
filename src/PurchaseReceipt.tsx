import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppSelect } from "./components/AppSelect";
import { AmountInput } from "./components/AmountInput";
import { ApiError, command, newKey, request, type ApiList } from "./api";
import { decimal, quantity } from "./sales/checkout-model";

type PurchaseItem = {
  id: number;
  product: { name: string };
  unit: { name: string };
  quantityOrdered: number;
  quantityReceived: number;
  agreedUnitCost: string;
};
type Purchase = { id: string | number; items?: PurchaseItem[] };
type Warehouse = { id: number; name: string };
type Line = {
  purchaseItemId: number;
  name: string;
  unit: string;
  remaining: number;
  quantity: string;
  warehouseId: string;
  cost: string;
  expiryDate: string;
};
type Payload = {
  receivedAt: string;
  items: Array<{
    purchaseItemId: number;
    warehouseId: number;
    quantityInOrderUnit: number;
    actualUnitCost: string;
    expiryDate?: string;
  }>;
};
type Attempt = { version: 1; key: string; payload: Payload };
const storageKey = (userId: string, purchaseId: string | number) =>
  `sb-purchase-receipt-v1:${userId}:${purchaseId}`;
function readAttempt(key: string): Attempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    return value?.version === 1 &&
      value.key &&
      Array.isArray(value.payload?.items)
      ? value
      : null;
  } catch {
    return null;
  }
}
async function warehouses(): Promise<Warehouse[]> {
  const rows: Warehouse[] = [];
  let page = 1;
  while (true) {
    const response = await request<ApiList<Warehouse>>(
      `/warehouses/?limit=100&page=${page}`,
    );
    rows.push(...response.data);
    if (!response.pagination || page >= response.pagination.totalPages)
      return rows;
    page++;
  }
}
function initialLines(purchase: Purchase): Line[] {
  return (purchase.items || [])
    .filter((item) => item.quantityOrdered > item.quantityReceived)
    .map((item) => ({
      purchaseItemId: item.id,
      name: item.product.name,
      unit: item.unit.name,
      remaining: item.quantityOrdered - item.quantityReceived,
      quantity: "0",
      warehouseId: "",
      cost: item.agreedUnitCost,
      expiryDate: "",
    }));
}
export function ReceiptModal({
  purchase,
  userId,
  close,
  done,
}: {
  purchase: Purchase;
  userId: string;
  close: () => void;
  done: (receiptId: number) => void;
}) {
  const key = storageKey(userId, purchase.id);
  const [lines, setLines] = useState<Line[]>(() => initialLines(purchase));
  const [attempt, setAttempt] = useState<Attempt | null>(() =>
    readAttempt(key),
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const warehouseQuery = useQuery({
    queryKey: ["purchase-warehouses", userId],
    queryFn: warehouses,
  });
  function update(id: number, change: Partial<Line>) {
    setLines((current) =>
      current.map((line) =>
        line.purchaseItemId === id ? { ...line, ...change } : line,
      ),
    );
    setError("");
  }
  function payload(): Payload {
    const included = lines.filter((line) => line.quantity !== "0");
    if (!included.length)
      throw Error("Enter a received quantity for at least one product.");
    const items = included.map((line) => {
      const count = quantity(line.quantity);
      if (count === null || count > line.remaining)
        throw Error(
          `Received quantity for ${line.name} must be between 1 and ${line.remaining}.`,
        );
      const warehouseId = quantity(line.warehouseId);
      if (warehouseId === null)
        throw Error(`Choose a warehouse for ${line.name}.`);
      if (decimal(line.cost) === null)
        throw Error(`Enter a valid actual unit cost for ${line.name}.`);
      return {
        purchaseItemId: line.purchaseItemId,
        warehouseId,
        quantityInOrderUnit: count,
        actualUnitCost: line.cost,
        ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
      };
    });
    return { receivedAt: new Date().toISOString(), items };
  }
  async function save() {
    if (busy) return;
    let current = attempt;
    try {
      if (!current) {
        current = { version: 1, key: newKey(), payload: payload() };
        sessionStorage.setItem(key, JSON.stringify(current));
        setAttempt(current);
      }
      if (!navigator.onLine)
        throw new ApiError(
          0,
          "Reconnect, then retry this receipt. It will not be sent automatically.",
        );
      setBusy(true);
      setError("");
      const response = await command<{ data: { receipt: { id: number } } }>(
        `/purchase/${purchase.id}/receipts`,
        current.payload,
        current.key,
      );
      const receiptId = response.data.receipt.id;
      if (!Number.isSafeInteger(receiptId) || receiptId < 1)
        throw Error(
          "The server did not return a valid receipt ID. Retry to recover this receipt.",
        );
      sessionStorage.removeItem(key);
      setAttempt(null);
      done(receiptId);
    } catch (e) {
      const failure = e as ApiError;
      setError(failure.message);
      if (current && [400, 403].includes(failure.status)) {
        sessionStorage.removeItem(key);
        setAttempt(null);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-back">
      <div
        className="modal purchase-receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-receipt-title"
      >
        <div className="modal-head">
          <h2 id="purchase-receipt-title">Draft goods receipt</h2>
          <button
            type="button"
            className="icon"
            aria-label="Close receipt"
            onClick={close}
          >
            ×
          </button>
        </div>
        {attempt ? (
          <>
            <p>
              The server may have saved this draft. Retry with the same request
              before starting another receipt.
            </p>
            <p>{attempt.payload.items.length} received product lines</p>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="primary"
                disabled={busy || !navigator.onLine}
                onClick={save}
              >
                {busy ? "Checking…" : "Retry same draft"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-intro">
              Record only the goods that physically arrived. A draft leaves
              stock unchanged; posting the draft adds stock.
            </p>
            {warehouseQuery.isPending ? (
              <div className="state" role="status">
                Loading warehouses…
              </div>
            ) : warehouseQuery.isError ? (
              <div className="alert error" role="alert">
                {warehouseQuery.error.message}{" "}
                <button
                  type="button"
                  className="sale-text-button"
                  onClick={() => warehouseQuery.refetch()}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                {lines.length ? (
                  lines.map((line) => (
                    <div
                      className="purchase-receipt-line"
                      key={line.purchaseItemId}
                    >
                      <div>
                        <b>{line.name}</b>
                        <small>
                          {line.unit} · {line.remaining} remaining
                        </small>
                      </div>
                      <label>
                        Received now
                        <input
                          aria-label={`${line.name} received now`}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={line.remaining}
                          step="1"
                          value={line.quantity}
                          onChange={(event) =>
                            update(line.purchaseItemId, {
                              quantity: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Warehouse
                        <AppSelect
                          aria-label={`${line.name} receiving warehouse`}
                          value={line.warehouseId}
                          onValueChange={(value) =>
                            update(line.purchaseItemId, { warehouseId: value })
                          }
                          disabled={line.quantity === "0"}
                          placeholder="Choose warehouse"
                          options={warehouseQuery.data.map((warehouse) => ({
                            value: String(warehouse.id),
                            label: warehouse.name,
                          }))}
                        />
                      </label>
                      <label>
                        Actual unit cost · ₦
                        <AmountInput
                          aria-label={`${line.name} actual unit cost`}
                          value={line.cost}
                          onValueChange={(value) =>
                            update(line.purchaseItemId, {
                              cost: value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Expiry, if applicable
                        <input
                          aria-label={`${line.name} expiry`}
                          type="date"
                          value={line.expiryDate}
                          onChange={(event) =>
                            update(line.purchaseItemId, {
                              expiryDate: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="state">
                    All ordered quantities have already been received.
                  </div>
                )}
                {error && (
                  <div className="alert error" role="alert">
                    {error}
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="subtle" onClick={close}>
                    Receive later
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !lines.length}
                    onClick={save}
                  >
                    {busy ? "Saving…" : "Save draft & review posting"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
