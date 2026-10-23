import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AppSelect } from "./components/AppSelect";
import { ApiError, command, date, listData, newKey, type ApiList } from "./api";
import { cachedRequest } from "./query";
import { ProductCreate } from "./MasterForms";
import "./opening-stock.css";

type Product = { id: string; name: string; baseUnit: string };
type Unit = { id: number; name: string; multiplier: number };
type Warehouse = { id: number; name: string };
type DraftLine = {
  id: string;
  productId: string;
  unitId: string;
  unitName: string;
  warehouseId: string;
  quantity: string;
  expiryDate: string;
};
type Body = {
  notes?: string;
  lines: Array<{
    productId: string;
    unitId: number;
    warehouseId: number;
    quantityInUnit: number;
    expiryDate?: string;
  }>;
};
type Attempt = { key: string; body: Body };
type Result = {
  postingId: string;
  postingStatus: string;
  postedAt: string;
  replayed: boolean;
  lines: Array<{
    product: Product;
    unit: Unit;
    warehouse: Warehouse;
    quantityInUnit: number;
    quantityBase: number;
    expiryDate: string | null;
    batchId: string;
    resultingProductSellableCache: number;
  }>;
};

async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 1000; page++) {
    const response = await cachedRequest<ApiList<T>>(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page}`,
    );
    rows.push(...listData(response, path));
    if (!response.pagination || page >= response.pagination.totalPages)
      return rows;
  }
  throw new Error(`Too many pages returned for ${path}.`);
}
const emptyLine = (): DraftLine => ({
  id: newKey(),
  productId: "",
  unitId: "",
  unitName: "",
  warehouseId: "",
  quantity: "",
  expiryDate: "",
});
const attemptKey = (userId: string) => `sb-opening-stock-attempt-v1:${userId}`;
function readAttempt(userId: string): Attempt | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(attemptKey(userId)) || "null",
    );
    return typeof value?.key === "string" && Array.isArray(value?.body?.lines)
      ? (value as Attempt)
      : null;
  } catch {
    return null;
  }
}
function saveAttempt(userId: string, attempt: Attempt | null) {
  try {
    if (attempt)
      sessionStorage.setItem(attemptKey(userId), JSON.stringify(attempt));
    else sessionStorage.removeItem(attemptKey(userId));
  } catch {
    /* The in-memory attempt still supports retry in this tab. */
  }
}
function wholeQuantity(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity <= 2_147_483_647
    ? quantity
    : null;
}
function UnitPicker({
  productId,
  value,
  onChange,
  disabled,
}: {
  productId: string;
  value: string;
  onChange: (value: string, name: string) => void;
  disabled: boolean;
}) {
  const query = useQuery({
    queryKey: ["opening-stock-units", productId],
    queryFn: () => allPages<Unit>(`/catalog/products/${productId}/units`),
    enabled: !!productId,
  });
  return (
    <>
      <AppSelect
        value={value}
        onValueChange={(next) =>
          onChange(
            next,
            query.data?.find((unit) => String(unit.id) === next)?.name || "",
          )
        }
        disabled={disabled || !productId || query.isPending || query.isError}
        aria-label="Product unit"
        options={[
          { value: "", label: <>Choose unit</> },
          ...(query.data || []).map((unit) => ({
            value: String(unit.id),
            label: (
              <>
                {unit.name} · ×{unit.multiplier}
              </>
            ),
          })),
        ]}
      />
      {query.isError && (
        <small role="alert">
          Could not load units.{" "}
          <button
            type="button"
            className="text-action"
            onClick={() => query.refetch()}
          >
            Retry
          </button>
        </small>
      )}
    </>
  );
}
export function OpeningStock({
  userId,
  close,
}: {
  userId: string;
  close: () => void;
}) {
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(() =>
    readAttempt(userId),
  );
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const posting = useRef(false);
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["opening-stock-products"],
    queryFn: () => allPages<Product>("/catalog/products"),
  });
  const warehouses = useQuery({
    queryKey: ["opening-stock-warehouses"],
    queryFn: () => allPages<Warehouse>("/warehouses"),
  });
  const loading = products.isPending || warehouses.isPending;
  const loadError = products.error || warehouses.error;
  const productName = (id: string) =>
    products.data?.find((item) => item.id === id)?.name || id;
  const warehouseName = (id: string) =>
    warehouses.data?.find((item) => String(item.id) === id)?.name || id;
  function update(id: string, change: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...change } : line)),
    );
    setError("");
  }
  function validate(): string {
    if (!lines.length) return "Add at least one counted product.";
    const seen = new Set<string>();
    for (const [index, line] of lines.entries()) {
      if (
        !line.productId ||
        !line.unitId ||
        !line.unitName ||
        !line.warehouseId ||
        wholeQuantity(line.quantity) === null
      )
        return `Complete the product, unit, warehouse and whole quantity in line ${index + 1}.`;
      const key = `${line.productId}:${line.warehouseId}:${line.expiryDate || "none"}`;
      if (seen.has(key))
        return "Each product, warehouse and expiry combination needs one line. Change the expiry or combine the count.";
      seen.add(key);
      if (line.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(line.expiryDate))
        return `Enter a valid expiry date in line ${index + 1}.`;
    }
    if (notes.trim().length > 1000)
      return "Notes must be 1,000 characters or fewer.";
    return "";
  }
  function body(): Body {
    return {
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      lines: lines.map((line) => ({
        productId: line.productId,
        unitId: Number(line.unitId),
        warehouseId: Number(line.warehouseId),
        quantityInUnit: Number(line.quantity),
        ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
      })),
    };
  }
  function beginReview(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setReview(true);
  }
  async function post() {
    if (posting.current) return;
    posting.current = true;
    const next = attempt || { key: newKey(), body: body() };
    if (!attempt) {
      setAttempt(next);
      saveAttempt(userId, next);
    }
    setBusy(true);
    setError("");
    try {
      const response = await command<{ status: string; data: Result }>(
        "/inventory/opening-stock",
        next.body,
        next.key,
      );
      if (!response?.data?.postingId || !Array.isArray(response.data.lines))
        throw new Error(
          "The server returned an unexpected opening stock response. Keep this attempt and verify the posting before trying again.",
        );
      setResult(response.data);
      setAttempt(null);
      saveAttempt(userId, null);
    } catch (cause) {
      const issue = cause as ApiError;
      setError(
        issue.status === 0
          ? `${issue.message} The result is uncertain; retrying will send the exact same request.`
          : issue.message || "Could not confirm opening stock.",
      );
      // Preserve even on an HTTP error: the posting may have committed before the response failed.
    } finally {
      posting.current = false;
      setBusy(false);
    }
  }
  function discardAttempt() {
    setAttempt(null);
    saveAttempt(userId, null);
    setReview(false);
    setError("");
  }
  return (
    <>
      <button className="back" onClick={close}>
        <ArrowLeft size={17} /> Inventory
      </button>
      <div className="page-head">
        <div>
          <div className="eyebrow">WAREHOUSE / INVENTORY</div>
          <h1>Opening stock</h1>
          <p>Record goods already on hand when a product enters inventory.</p>
        </div>
        {!review && !attempt && !result && (
          <button
            className="subtle"
            onClick={() => setProductOpen(true)}
            disabled={lines.length >= 100 && lines.every((line) => line.productId)}
          >
            <Plus size={17} /> New product
          </button>
        )}
      </div>
      <div className="opening-intro">
        <strong>First count only</strong>
        <p>
          Posting adds sellable stock immediately. A product and warehouse that
          already has stock records cannot be entered again here. Use a physical
          adjustment for later corrections. Quantities are in the selected
          ProductUnit; the server determines base units.
        </p>
      </div>
      {attempt && !result && (
        <div className="opening-attempt" role="status">
          <strong>Submission pending confirmation</strong>
          <p>
            An earlier request may have reached the server. Retry the same count
            and key to receive its result. Discard only after checking it was
            not posted.
          </p>
          <div className="opening-actions">
            <button
              type="button"
              className="subtle"
              onClick={discardAttempt}
              disabled={busy}
            >
              Discard pending attempt
            </button>
            <button
              type="button"
              className="primary"
              onClick={post}
              disabled={busy}
            >
              {busy ? "Checking…" : "Retry same request"}
            </button>
          </div>
        </div>
      )}
      {result ? (
        <div className="panel opening-result">
          <div className="panel-head">
            <div>
              <h2>
                <Check size={20} /> Opening stock posted
              </h2>
              <p>
                {date(result.postedAt)} · {result.postingStatus}
                {result.replayed ? " · confirmed from an earlier request" : ""}
              </p>
            </div>
          </div>
          <div className="opening-result-id">
            Posting ID <strong>{result.postingId}</strong>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Warehouse</th>
                  <th>Entered</th>
                  <th>Base units added</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => (
                  <tr key={line.batchId}>
                    <td>
                      <strong>{line.product.name}</strong>
                      <small>Batch {line.batchId}</small>
                    </td>
                    <td>{line.warehouse.name}</td>
                    <td>
                      {line.quantityInUnit} {line.unit.name}
                    </td>
                    <td>
                      {line.quantityBase} {line.product.baseUnit}
                    </td>
                    <td>{line.expiryDate || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="opening-actions opening-result-actions">
            <button className="subtle" onClick={close}>
              Back to inventory
            </button>
            <button
              className="primary"
              onClick={() => {
                setResult(null);
                setLines([emptyLine()]);
                setNotes("");
                setReview(false);
              }}
            >
              New opening count
            </button>
          </div>
        </div>
      ) : (
        <div className="panel opening-panel">
          <div className="panel-head">
            <div>
              <h2>
                {review || attempt
                  ? "Review opening count"
                  : "Counted products"}
              </h2>
              <p>
                {attempt
                  ? "The saved request below is locked for a safe retry."
                  : "Add up to 100 lines. You can use separate expiry dates for the same product and warehouse."}
              </p>
            </div>
          </div>
          {loading ? (
            <div className="state">Loading products and warehouses…</div>
          ) : loadError ? (
            <div className="state">
              <h3>Could not load choices</h3>
              <p>{(loadError as Error).message}</p>
              <button
                className="subtle"
                onClick={() => {
                  products.refetch();
                  warehouses.refetch();
                }}
              >
                <RefreshCw size={16} /> Retry
              </button>
            </div>
          ) : !products.data?.length || !warehouses.data?.length ? (
            <div className="state">
              <h3>Set up products and warehouses first</h3>
              <p>Opening stock needs at least one product and warehouse.</p>
            </div>
          ) : attempt ? (
            <div className="opening-review">
              <p>
                {attempt.body.lines.length} counted line
                {attempt.body.lines.length === 1 ? "" : "s"} ready to confirm.
              </p>
              {attempt.body.lines.map((line, index) => (
                <div className="opening-review-line" key={index}>
                  <strong>{productName(line.productId)}</strong>
                  <span>
                    {line.quantityInUnit} units ·{" "}
                    {warehouseName(String(line.warehouseId))}
                    {line.expiryDate ? ` · Expires ${line.expiryDate}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : review ? (
            <div className="opening-review">
              <p>
                Check every product, warehouse, unit, quantity and expiry.
                Confirming posts sellable stock immediately.
              </p>
              {lines.map((line, index) => (
                <div className="opening-review-line" key={line.id}>
                  <strong>
                    {index + 1}. {productName(line.productId)}
                  </strong>
                  <span>
                    {line.quantity} {line.unitName} ·{" "}
                    {warehouseName(line.warehouseId)}
                    {line.expiryDate
                      ? ` · Expires ${line.expiryDate}`
                      : " · No expiry"}
                  </span>
                </div>
              ))}
              {notes && <p>Notes: {notes}</p>}
            </div>
          ) : (
            <form id="opening-form" onSubmit={beginReview}>
              <div className="opening-lines">
                {lines.map((line, index) => (
                  <div className="opening-line" key={line.id}>
                    <div className="opening-line-head">
                      <strong>Line {index + 1}</strong>
                      <button
                        type="button"
                        className="text-action"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((item) => item.id !== line.id),
                          )
                        }
                      >
                        <Trash2 size={16} /> Remove
                      </button>
                    </div>
                    <div className="opening-fields">
                      <label>
                        Product
                        <AppSelect
                          value={line.productId}
                          onValueChange={(value) =>
                            update(line.id, {
                              productId: value,
                              unitId: "",
                              unitName: "",
                            })
                          }
                          aria-label={`Product for line ${index + 1}`}
                          options={[
                            { value: "", label: <>Choose product</> },
                            ...products.data.map((product) => ({
                              value: product.id,
                              label: <>{product.name}</>,
                            })),
                          ]}
                        />
                      </label>
                      <label>
                        Product unit
                        <UnitPicker
                          productId={line.productId}
                          value={line.unitId}
                          onChange={(value, name) =>
                            update(line.id, { unitId: value, unitName: name })
                          }
                          disabled={false}
                        />
                      </label>
                      <label>
                        Warehouse
                        <AppSelect
                          value={line.warehouseId}
                          onValueChange={(value) =>
                            update(line.id, { warehouseId: value })
                          }
                          aria-label={`Warehouse for line ${index + 1}`}
                          options={[
                            { value: "", label: <>Choose warehouse</> },
                            ...warehouses.data.map((warehouse) => ({
                              value: String(warehouse.id),
                              label: <>{warehouse.name}</>,
                            })),
                          ]}
                        />
                      </label>
                      <label>
                        Counted quantity
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="2147483647"
                          step="1"
                          value={line.quantity}
                          onChange={(event) =>
                            update(line.id, { quantity: event.target.value })
                          }
                          placeholder="Whole units"
                        />
                      </label>
                      <label>
                        Expiry date{" "}
                        <span className="opening-optional">optional</span>
                        <input
                          type="date"
                          value={line.expiryDate}
                          onChange={(event) =>
                            update(line.id, { expiryDate: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="subtle opening-add"
                disabled={lines.length >= 100}
                onClick={() => setLines((current) => [...current, emptyLine()])}
              >
                <Plus size={16} /> Add another product
              </button>
              <label className="opening-notes">
                Count notes <span className="opening-optional">optional</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={1000}
                  placeholder="For example, counted before go-live"
                />
              </label>
            </form>
          )}
          {error && (
            <div className="alert error opening-error" role="alert">
              {error}
            </div>
          )}
          {!attempt && (
            <div className="opening-actions">
              {review && (
                <button
                  type="button"
                  className="subtle"
                  onClick={() => {
                    setReview(false);
                    setError("");
                  }}
                >
                  Edit count
                </button>
              )}
              <button
                type={review ? "button" : "submit"}
                form={review ? undefined : "opening-form"}
                className="primary"
                disabled={
                  busy ||
                  loading ||
                  !!loadError ||
                  !products.data?.length ||
                  !warehouses.data?.length
                }
                onClick={review ? post : undefined}
              >
                {busy
                  ? "Posting…"
                  : review
                    ? "Confirm and post stock"
                    : "Review count"}
              </button>
            </div>
          )}
        </div>
      )}
      {productOpen && (
        <ProductCreate
          close={() => {
            setProductOpen(false);
            void products.refetch();
          }}
          done={(product) => {
            queryClient.setQueryData<Product[]>(
              ["opening-stock-products"],
              (current) =>
                current?.some((item) => item.id === product.id)
                  ? current
                  : [...(current || []), { ...product, baseUnit: "" }],
            );
            setLines((current) => {
              const empty = current.find((line) => !line.productId);
              if (empty)
                return current.map((line) =>
                  line.id === empty.id
                    ? {
                        ...line,
                        productId: product.id,
                        unitId: "",
                        unitName: "",
                      }
                    : line,
                );
              return current.length < 100
                ? [...current, { ...emptyLine(), productId: product.id }]
                : current;
            });
            setProductOpen(false);
            void products.refetch();
          }}
        />
      )}
    </>
  );
}
