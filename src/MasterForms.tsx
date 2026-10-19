import { AppSelect } from "./components/AppSelect";
import { AmountInput } from "./components/AmountInput";
import React, { useEffect, useState } from "react";
import { cachedRequest } from "./query";
import { money, request, type ApiList } from "./api";
type Entry = { id: string | number; name: string };
function Frame({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-back"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function ProductCreate({
  close,
  done,
}: {
  close: () => void;
  done: () => void;
}) {
  const [categories, setCategories] = useState<Entry[]>([]),
    [name, setName] = useState(""),
    [baseUnit, setBase] = useState(""),
    [categoryId, setCategory] = useState(""),
    [reorderPoint, setReorder] = useState("0"),
    [unitName, setUnitName] = useState(""),
    [sku, setSku] = useState(""),
    [price, setPrice] = useState("0"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    cachedRequest<ApiList<Entry>>("/catalog/categories?limit=100")
      .then((r) => setCategories(r.data))
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/catalog/products", {
        method: "POST",
        body: JSON.stringify({
          name,
          baseUnit,
          categoryId,
          reorderPoint: Number(reorderPoint),
          units: [{ name: unitName, multiplier: 1, price, sku }],
        }),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title="New product" close={close}>
      <form onSubmit={submit}>
        <p className="modal-intro">
          Each product needs at least one base unit with a multiplier of 1. Add
          larger units from the product detail after creation.
        </p>
        <label>
          Product name
          <input
            minLength={2}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Base unit name
            <input
              required
              value={baseUnit}
              onChange={(e) => setBase(e.target.value)}
              placeholder="bottle, piece, litre"
            />
          </label>
          <label>
            Category
            <AppSelect
              required
              value={categoryId}
              onValueChange={(value) => setCategory(value)}
              placeholder="Choose category"
              options={[
                ...categories.map((c) => ({
                  value: String(c.id),
                  label: <>{c.name}</>,
                })),
              ]}
            />
          </label>
        </div>
        <label>
          Reorder point (base units)
          <input
            type="number"
            min="0"
            step="1"
            required
            value={reorderPoint}
            onChange={(e) => setReorder(e.target.value)}
          />
        </label>
        <h3>Base ProductUnit</h3>
        <div className="form-grid">
          <label>
            Unit name
            <input
              minLength={2}
              required
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
            />
          </label>
          <label>
            SKU
            <input
              required
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </label>
        </div>
        <label>
          Unit price (₦)
          <AmountInput
            pattern="[0-9]{1,3}(,[0-9]{3})*(\.[0-9]{1,4})?"
            required
            value={price}
            onValueChange={setPrice}
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="subtle" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Create product
          </button>
        </div>
      </form>
    </Frame>
  );
}
export function UnitCreate({
  productId,
  close,
  done,
}: {
  productId: string;
  close: () => void;
  done: () => void;
}) {
  const [name, setName] = useState(""),
    [multiplier, setMultiplier] = useState("1"),
    [sku, setSku] = useState(""),
    [price, setPrice] = useState("0"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(`/catalog/products/${productId}/units`, {
        method: "POST",
        body: JSON.stringify({
          name,
          multiplier: Number(multiplier),
          price,
          sku,
        }),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title="Add ProductUnit" close={close}>
      <form onSubmit={submit}>
        <label>
          Name
          <input
            minLength={2}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Multiplier in base units
          <input
            type="number"
            min="1"
            step="1"
            required
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
          />
        </label>
        <label>
          SKU
          <input
            required
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </label>
        <label>
          Price (₦)
          <AmountInput
            pattern="[0-9]{1,3}(,[0-9]{3})*(\.[0-9]{1,4})?"
            required
            value={price}
            onValueChange={setPrice}
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="subtle" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Add unit
          </button>
        </div>
      </form>
    </Frame>
  );
}
export function EditRecord({
  path,
  record,
  fields,
  close,
  done,
}: {
  path: string;
  record: Record<string, any>;
  fields: Array<
    | "name"
    | "location"
    | "reorderPoint"
    | "price"
    | "sku"
    | "isBuyer"
    | "isSupplier"
  >;
  close: () => void;
  done: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>(() =>
      Object.fromEntries(fields.map((f) => [f, record[f] ?? ""])),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries(
        fields
          .filter((f) => values[f] !== record[f])
          .map((f) => [
            f,
            f === "reorderPoint" ? Number(values[f]) : values[f],
          ]),
      );
      if (!Object.keys(body).length) {
        done();
        return;
      }
      await request(path, { method: "PATCH", body: JSON.stringify(body) });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title="Edit record" close={close}>
      <form onSubmit={submit}>
        {fields.map((f) => (
          <label key={f}>
            {f.replace(/([A-Z])/g, " $1")}
            {f === "isBuyer" || f === "isSupplier" ? (
              <input
                type="checkbox"
                checked={Boolean(values[f])}
                onChange={(e) =>
                  setValues({ ...values, [f]: e.target.checked })
                }
              />
            ) : f === "price" ? (
              <AmountInput
                required
                value={String(values[f])}
                onValueChange={(value) => setValues({ ...values, [f]: value })}
                pattern="[0-9]{1,3}(,[0-9]{3})*(\.[0-9]{1,4})?"
              />
            ) : (
              <input
                required={f !== "location"}
                type={f === "reorderPoint" ? "number" : "text"}
                min={f === "reorderPoint" ? "0" : undefined}
                value={values[f]}
                onChange={(e) => setValues({ ...values, [f]: e.target.value })}
              />
            )}
          </label>
        ))}
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="subtle" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Save changes
          </button>
        </div>
      </form>
    </Frame>
  );
}
export function UnitSummary({ unit }: { unit: Record<string, any> }) {
  return (
    <div className="history-row">
      <b>{unit.name}</b>
      <span>{unit.sku}</span>
      <span>×{unit.multiplier}</span>
      <span>{money(unit.price)}</span>
    </div>
  );
}
