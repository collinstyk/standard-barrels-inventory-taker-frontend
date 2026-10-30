import { AmountInput } from "./components/AmountInput";
import { CategoryCombobox } from "./components/CategoryCombobox";
import { AppSelect } from "./components/AppSelect";
import { X } from "lucide-react";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cachedRequest } from "./query";
import { ApiError, money, request, type ApiList } from "./api";
type Entry = { id: string | number; name: string };
async function loadCategories(): Promise<Entry[]> {
  const categories: Entry[] = [];
  let page = 1;
  while (true) {
    const response = await cachedRequest<ApiList<Entry>>(
      `/catalog/categories?limit=100&page=${page}`,
    );
    categories.push(...response.data);
    if (!response.pagination || page >= response.pagination.totalPages)
      return categories;
    page++;
  }
}
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
            <X size={18} />
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
  done: (product: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState(""),
    [baseUnit, setBase] = useState(""),
    [categoryId, setCategory] = useState(""),
    [newCategoryName, setNewCategoryName] = useState(""),
    [reorderPoint, setReorder] = useState("0"),
    [unitName, setUnitName] = useState(""),
    [sku, setSku] = useState(""),
    [price, setPrice] = useState("0"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const categoriesQuery = useQuery({
    queryKey: ["product-create-categories"],
    queryFn: loadCategories,
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || uncertain) return;
    if (!categoryId && !newCategoryName) {
      setError("Choose an existing category or create a new one.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await request<{ data: { id: string; name: string } }>(
        "/catalog/products",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            baseUnit,
            ...(categoryId ? { categoryId } : { newCategoryName }),
            reorderPoint: Number(reorderPoint),
            units: [{ name: unitName, multiplier: 1, price, sku }],
          }),
        },
      );
      if (!response.data?.id || !response.data?.name) {
        setUncertain(true);
        throw new Error(
          "Product saved, but the server did not return its details. Close this form and refresh the product list before trying again.",
        );
      }
      done(response.data);
    } catch (e) {
      if ((e as ApiError).status === 0) {
        setUncertain(true);
        setError(
          "The connection failed after submission. This product may already exist. Close this form and refresh the product list before trying again.",
        );
      } else {
        setError((e as Error).message);
      }
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
          <div>
            <CategoryCombobox
              categories={categoriesQuery.data || []}
              categoryId={categoryId}
              newCategoryName={newCategoryName}
              onExisting={(id) => {
                setCategory(id);
                setNewCategoryName("");
                setError("");
              }}
              onNew={(categoryName) => {
                setCategory("");
                setNewCategoryName(categoryName);
                setError("");
              }}
              disabled={busy || uncertain || categoriesQuery.isPending || categoriesQuery.isError}
            />
            {categoriesQuery.isPending && <small className="category-load-state">Loading categories…</small>}
            {categoriesQuery.isError && (
              <div className="category-load-state" role="alert">
                Categories could not be loaded. <button type="button" className="sale-text-button" onClick={() => categoriesQuery.refetch()}>Retry</button>
              </div>
            )}
          </div>
        </div>
        <label>
          Reorder point ({baseUnit || "base units"})
          <input
            type="number"
            min="0"
            step="1"
            required
            value={reorderPoint}
            onChange={(e) => setReorder(e.target.value)}
          />
        </label>
        <small className="category-load-state">You can set this in a larger product unit after adding that unit.</small>
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
          <button className="primary" disabled={busy || uncertain || categoriesQuery.isPending || categoriesQuery.isError}>
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
export function ReorderPointEditor({
  product,
  close,
  done,
}: {
  product: { id: string | number; name: string; baseUnit: string; reorderPoint: number; units: Array<{ id: number; name: string; multiplier: number }> };
  close: () => void;
  done: () => void;
}) {
  const baseUnit = product.units.find((unit) => unit.multiplier === 1) ?? product.units[0];
  const [unitId, setUnitId] = useState(String(baseUnit?.id ?? ""));
  const [quantity, setQuantity] = useState(String(product.reorderPoint));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const unit = product.units.find((item) => String(item.id) === unitId) ?? baseUnit;
  const baseQuantity = /^\d+$/.test(quantity) && unit ? BigInt(quantity) * BigInt(unit.multiplier) : null;
  const valid = baseQuantity !== null && baseQuantity <= 2_147_483_647n;

  function chooseUnit(value: string) {
    const next = product.units.find((item) => String(item.id) === value);
    if (!next) return;
    setUnitId(value);
    setQuantity(product.reorderPoint % next.multiplier === 0
      ? String(product.reorderPoint / next.multiplier) : "");
    setError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !valid || baseQuantity === null) return;
    setBusy(true);
    setError("");
    try {
      await request(`/catalog/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ reorderPoint: Number(baseQuantity) }),
      });
      done();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <Frame title={`Reorder point · ${product.name}`} close={close}>
    <form onSubmit={submit}>
      <p className="modal-intro">Choose the unit you count in. The saved threshold is shown in base units so it matches inventory alerts.</p>
      {product.units.length > 1 && <div className="reorder-unit-field"><span>Counting unit</span><AppSelect
        value={unitId} onValueChange={chooseUnit} aria-label="Counting unit"
        options={product.units.map((item) => ({ value: String(item.id), label: <>{item.name} · {item.multiplier} {product.baseUnit}</> }))} /></div>}
      <label>Reorder when stock reaches
        <input type="number" min="0" max={unit ? Math.floor(2_147_483_647 / unit.multiplier) : undefined}
          step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </label>
      <p className="reorder-equivalent">{valid ? `${baseQuantity?.toLocaleString()} ${product.baseUnit} in base units` : "Enter a whole number within the supported stock range."}</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="subtle" onClick={close}>Cancel</button>
        <button className="primary" disabled={busy || !valid}>Save reorder point</button></div>
    </form>
  </Frame>;
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
