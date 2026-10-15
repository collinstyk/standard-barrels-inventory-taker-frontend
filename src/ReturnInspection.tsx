import React, { useEffect, useState } from "react";
import { ApiError, command, newKey, request } from "./api";
type ReturnItem = {
  id: number;
  quantityInOrderUnit: number;
  inventoryBatches?: Array<{
    id: string;
    quantityOnHandBase: number;
    disposition: string;
  }>;
};
const checkNames = [
  "packagingIntact",
  "sealIntact",
  "correctProduct",
  "correctQuantity",
  "expiryChecked",
  "visibleDamage",
  "returnReasonConfirmed",
] as const;
type CheckName = (typeof checkNames)[number];
type Check = "PASSED" | "FAILED" | "NOT_APPLICABLE";
export function ReturnInspection({
  saleId,
  returnId,
  items,
  close,
  done,
}: {
  saleId: number;
  returnId: number;
  items: ReturnItem[];
  close: () => void;
  done: () => void;
}) {
  const [warehouses, setWarehouses] = useState<
      Array<{ id: number; name: string }>
    >([]),
    [itemId, setItem] = useState(""),
    [batchId, setBatch] = useState(""),
    [warehouseId, setWarehouse] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [outcome, setOutcome] = useState("SELLABLE"),
    [notes, setNotes] = useState(""),
    [checks, setChecks] = useState<Record<CheckName, Check>>(
      Object.fromEntries(checkNames.map((k) => [k, "PASSED"])) as Record<
        CheckName,
        Check
      >,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{ key: string; body: unknown } | null>(
      null,
    );
  useEffect(() => {
    request<{ data: Array<{ id: number; name: string }> }>(
      "/warehouses/?limit=100",
    )
      .then((r) => setWarehouses(r.data))
      .catch((e) => setError(e.message));
  }, []);
  const selected = items.find((i) => i.id === Number(itemId));
  const batches =
    selected?.inventoryBatches?.filter(
      (b) => b.disposition === "QUARANTINED" && b.quantityOnHandBase > 0,
    ) || [];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = pending?.body || {
      saleReturnItemId: Number(itemId),
      sourceBatchId: batchId,
      warehouseId: Number(warehouseId),
      quantityInOrderUnit: Number(quantity),
      outcome,
      inspectedAt: new Date().toISOString(),
      notes,
      checks,
    };
    const attempt = pending || { key: newKey(), body };
    setPending(attempt);
    setBusy(true);
    setError("");
    try {
      await command(
        `/sale/${saleId}/returns/${returnId}/inspections`,
        attempt.body,
        attempt.key,
      );
      setPending(null);
      done();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.status !== 0) setPending(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-back">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Inspect customer return"
      >
        <div className="modal-head">
          <h2>Inspect returned stock</h2>
          <button className="icon" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <p className="modal-intro">
            Inspect quarantined stock and record evidence. The backend
            determines the final batch disposition.
          </p>
          <label>
            Return item
            <select
              required
              value={itemId}
              disabled={!!pending}
              onChange={(e) => {
                setItem(e.target.value);
                setBatch("");
              }}
            >
              <option value="">Choose item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  Item #{i.id} · {i.quantityInOrderUnit} requested
                </option>
              ))}
            </select>
          </label>
          <label>
            Quarantine batch
            <select
              required
              value={batchId}
              disabled={!!pending}
              onChange={(e) => setBatch(e.target.value)}
            >
              <option value="">Choose batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id.slice(0, 12)} · {b.quantityOnHandBase} base units
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Final warehouse
              <select
                required
                value={warehouseId}
                disabled={!!pending}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="">Choose warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity in order unit
              <input
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                disabled={!!pending}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          </div>
          <label>
            Outcome
            <select
              value={outcome}
              disabled={!!pending}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option>SELLABLE</option>
              <option>DAMAGED</option>
              <option>REJECTED</option>
            </select>
          </label>
          <div className="form-grid">
            {checkNames.map((k) => (
              <label key={k}>
                {k.replace(/([A-Z])/g, " $1")}
                <select
                  value={checks[k]}
                  disabled={!!pending}
                  onChange={(e) =>
                    setChecks({ ...checks, [k]: e.target.value as Check })
                  }
                >
                  <option>PASSED</option>
                  <option>FAILED</option>
                  <option>NOT_APPLICABLE</option>
                </select>
              </label>
            ))}
          </div>
          <label>
            Inspection notes
            <input
              value={notes}
              disabled={!!pending}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="subtle" onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {pending ? "Retry same inspection" : "Confirm inspection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
