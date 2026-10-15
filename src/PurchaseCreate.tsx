import React, { useEffect, useState } from "react";
import { ApiError, command, newKey, request, type ApiList } from "./api";
type Item = { id: string | number; name: string; sku?: string };
export function PurchaseCreate({
  close,
  done,
}: {
  close: () => void;
  done: () => void;
}) {
  const [contacts, setContacts] = useState<Item[]>([]),
    [products, setProducts] = useState<Item[]>([]),
    [units, setUnits] = useState<Item[]>([]),
    [supplierId, setSupplier] = useState(""),
    [productId, setProduct] = useState(""),
    [unitId, setUnit] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [cost, setCost] = useState("0"),
    [paid, setPaid] = useState("0"),
    [status, setStatus] = useState("DRAFT"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{ key: string; body: unknown } | null>(
      null,
    );
  useEffect(() => {
    Promise.all([
      request<ApiList<Item>>("/contacts/?type=SUPPLIER&limit=100"),
      request<ApiList<Item>>("/catalog/products?limit=100"),
    ])
      .then(([c, p]) => {
        setContacts(c.data);
        setProducts(p.data);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (productId)
      request<ApiList<Item>>(`/catalog/products/${productId}/units`)
        .then((r) => setUnits(r.data))
        .catch((e) => setError(e.message));
  }, [productId]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = pending?.body || {
      supplierId: supplierId || null,
      transactionStatus: status,
      amountPaid: paid,
      extraCost: "0",
      items: [
        {
          productId,
          unitId: Number(unitId),
          quantityOrdered: Number(quantity),
          agreedUnitCost: cost,
        },
      ],
    };
    const attempt = pending || { key: newKey(), body };
    setPending(attempt);
    setBusy(true);
    setError("");
    try {
      await command("/purchase/create", attempt.body, attempt.key);
      setPending(null);
      done();
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.status === 0
          ? "Network failed. Retry will send the identical request and key."
          : err.message,
      );
      if (err.status !== 0) setPending(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-back"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New purchase"
      >
        <div className="modal-head">
          <h2>New purchase</h2>
          <button className="icon" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <p className="modal-intro">
            Create the commercial order. Record and post goods separately when
            they arrive.
          </p>
          <label>
            Supplier
            <select
              value={supplierId}
              onChange={(e) => setSupplier(e.target.value)}
            >
              <option value="">Unassigned supplier</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option>DRAFT</option>
                <option>PENDING</option>
              </select>
            </label>
            <label>
              Amount paid (₦)
              <input
                required
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{1,4})?"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            </label>
          </div>
          <label>
            Product
            <select
              required
              value={productId}
              onChange={(e) => {
                setProduct(e.target.value);
                setUnit("");
              }}
            >
              <option value="">Choose product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Unit
              <select
                required
                value={unitId}
                onChange={(e) => setUnit(e.target.value)}
              >
                <option value="">Choose unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.sku}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          </div>
          <label>
            Agreed unit cost (₦)
            <input
              inputMode="decimal"
              required
              pattern="[0-9]+(\.[0-9]{1,4})?"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="subtle" onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy
                ? "Creating…"
                : pending
                  ? "Retry same purchase"
                  : "Create purchase"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
