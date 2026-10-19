import { AppSelect } from "./components/AppSelect";
import React, { useEffect, useState } from "react";
import { cachedRequest, refreshRequest } from "./query";
import { ApiError, command, date, newKey, request, type Role } from "./api";
import { ReturnInspection } from "./ReturnInspection";
type SaleItem = {
  id: number;
  product: { name: string };
  unit: { name: string };
  quantityDelivered: number;
};
type ReturnItem = {
  id: number;
  quantityInOrderUnit: number;
  quantitySummary?: {
    requestedQuantityBase: number;
    receivedQuantityBase: number;
    inspectedQuantityBase: number;
    remainingQuantityBase: number;
  };
  inventoryBatches?: Array<{
    id: string;
    quantityOnHandBase: number;
    disposition: string;
  }>;
};
type Return = {
  id: number;
  status: string;
  reason: string;
  createdAt: string;
  items: ReturnItem[];
  quantitySummary?: {
    requestedQuantityBase: number;
    receivedQuantityBase: number;
    inspectedQuantityBase: number;
    remainingQuantityBase: number;
  };
};
export function CustomerReturns({
  saleId,
  items,
  role,
}: {
  saleId: number;
  items: SaleItem[];
  role: Role;
}) {
  const [rows, setRows] = useState<Return[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<Return | null>(null),
    [receiving, setReceiving] = useState(false),
    [inspecting, setInspecting] = useState(false);
  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      const r = await (force ? refreshRequest : cachedRequest)<{
        data: { returns: Return[] };
      }>(`/sale/${saleId}/returns`);
      setRows(r.data.returns);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [saleId]);
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Customer returns</h2>
          <p>Received quantities remain in quarantine until inspected.</p>
        </div>
        {role !== "AUDITOR" && (
          <button className="subtle" onClick={() => setCreating(true)}>
            New return
          </button>
        )}
      </div>
      {loading ? (
        <div className="empty-inline">Loading returns…</div>
      ) : error ? (
        <div className="empty-inline">
          {error}{" "}
          <button className="subtle" onClick={() => load(true)}>
            Retry
          </button>
        </div>
      ) : rows.length ? (
        <div className="history">
          {rows.map((r) => (
            <div className="history-row" key={r.id}>
              <div>
                <b>Return #{r.id}</b>
                <small>
                  {r.reason} · {date(r.createdAt)}
                </small>
              </div>
              <span className="badge neutral">{r.status}</span>
              <button className="subtle" onClick={() => setSelected(r)}>
                Details
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-inline">No customer returns recorded.</div>
      )}
      {creating && (
        <ReturnCreate
          saleId={saleId}
          items={items}
          close={() => setCreating(false)}
          done={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {selected && (
        <div className="modal-back">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Customer return"
          >
            <div className="modal-head">
              <h2>Customer return #{selected.id}</h2>
              <button
                className="icon"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p>{selected.reason}</p>
            <div className="detail-pairs">
              <div>
                <span>Status</span>
                <b>{selected.status}</b>
              </div>
              <div>
                <span>Requested base units</span>
                <b>{selected.quantitySummary?.requestedQuantityBase ?? "—"}</b>
              </div>
              <div>
                <span>Received base units</span>
                <b>{selected.quantitySummary?.receivedQuantityBase ?? "—"}</b>
              </div>
              <div>
                <span>Remaining quarantine base units</span>
                <b>{selected.quantitySummary?.remainingQuantityBase ?? "—"}</b>
              </div>
            </div>
            {selected.items.map((i) => (
              <div className="history-row" key={i.id}>
                Item #{i.id} · {i.quantityInOrderUnit} in order unit
              </div>
            ))}
            {role !== "AUDITOR" && selected.status === "DRAFT" && (
              <button className="primary" onClick={() => setReceiving(true)}>
                Receive return
              </button>
            )}
            {["ADMIN", "MANAGER"].includes(role) &&
              selected.status !== "DRAFT" &&
              selected.status !== "CANCELLED" && (
                <button className="subtle" onClick={() => setInspecting(true)}>
                  Inspect return
                </button>
              )}
            {inspecting && (
              <ReturnInspection
                saleId={saleId}
                returnId={selected.id}
                items={selected.items}
                close={() => setInspecting(false)}
                done={() => {
                  setInspecting(false);
                  setSelected(null);
                  load();
                }}
              />
            )}
            {receiving && (
              <ReceiveReturn
                saleId={saleId}
                value={selected}
                close={() => setReceiving(false)}
                done={() => {
                  setReceiving(false);
                  setSelected(null);
                  load();
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function ReturnCreate({
  saleId,
  items,
  close,
  done,
}: {
  saleId: number;
  items: SaleItem[];
  close: () => void;
  done: () => void;
}) {
  const [reason, setReason] = useState(""),
    [itemId, setItem] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{ key: string; body: unknown } | null>(
      null,
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = pending?.body || {
      reason,
      items: [
        {
          originalSaleItemId: Number(itemId),
          quantityInOrderUnit: Number(quantity),
        },
      ],
    };
    const attempt = pending || { key: newKey(), body };
    setPending(attempt);
    setBusy(true);
    setError("");
    try {
      await command(`/sale/${saleId}/returns`, attempt.body, attempt.key);
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
        aria-label="New customer return"
      >
        <div className="modal-head">
          <h2>New customer return</h2>
          <button className="icon" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <label>
            Reason
            <input
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label>
            Dispatched sale item
            <AppSelect
              required
              value={itemId}
              onValueChange={(value) => setItem(value)}
              placeholder="Choose item"
              options={[
                ...items
                  .filter((i) => i.quantityDelivered > 0)
                  .map((i) => ({
                    value: String(i.id),
                    label: (
                      <>
                        {i.product.name} · {i.unit.name} · {i.quantityDelivered}{" "}
                        delivered
                      </>
                    ),
                  })),
              ]}
            />
          </label>
          <label>
            Quantity in sale unit
            <input
              type="number"
              min="1"
              step="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="subtle" onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {pending ? "Retry same return" : "Create return"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function ReceiveReturn({
  saleId,
  value,
  close,
  done,
}: {
  saleId: number;
  value: Return;
  close: () => void;
  done: () => void;
}) {
  const [warehouses, setWarehouses] = useState<
      Array<{ id: number; name: string }>
    >([]),
    [itemId, setItem] = useState(""),
    [warehouseId, setWarehouse] = useState(""),
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
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = pending?.body || {
      receivedAt: new Date().toISOString(),
      items: [
        { saleReturnItemId: Number(itemId), warehouseId: Number(warehouseId) },
      ],
    };
    const attempt = pending || { key: newKey(), body };
    setPending(attempt);
    setBusy(true);
    setError("");
    try {
      await command(
        `/sale/${saleId}/returns/${value.id}/receive`,
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
        aria-label="Receive customer return"
      >
        <div className="modal-head">
          <h2>Receive return #{value.id}</h2>
          <button className="icon" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <p className="modal-intro">
            Received stock is quarantined. An inspection is required before
            disposition.
          </p>
          <label>
            Return item
            <AppSelect
              required
              value={itemId}
              onValueChange={(value) => setItem(value)}
              placeholder="Choose item"
              options={[
                ...value.items.map((i) => ({
                  value: String(i.id),
                  label: (
                    <>
                      Item #{i.id} · {i.quantityInOrderUnit}
                    </>
                  ),
                })),
              ]}
            />
          </label>
          <label>
            Receiving warehouse
            <AppSelect
              required
              value={warehouseId}
              onValueChange={(value) => setWarehouse(value)}
              placeholder="Choose warehouse"
              options={[
                ...warehouses.map((w) => ({
                  value: String(w.id),
                  label: <>{w.name}</>,
                })),
              ]}
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="subtle" onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {pending ? "Retry same receipt" : "Receive return"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
