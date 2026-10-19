import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cachedRequest } from "./query";
import { ArrowLeft, ArrowRight, Plus, RefreshCw, X } from "lucide-react";
import { AppSelect } from "./components/AppSelect";
import { AmountInput } from "./components/AmountInput";
import {
  TransactionContactCreate,
  type TransactionContact,
} from "./components/TransactionContactCreate";
import { ApiError, command, money, newKey, request, type ApiList } from "./api";
import { decimal, decimalString, quantity } from "./sales/checkout-model";

type Contact = { id: string; name: string };
type Product = { id: string; name: string };
type Unit = { id: number; name: string; sku: string; price: string };
type Line = {
  id: string;
  productId: string;
  productName: string;
  unitId: number;
  unitName: string;
  quantity: string;
  cost: string;
};
type PurchaseBody = {
  supplierId: string | null;
  transactionStatus: "PENDING" | "COMPLETED";
  amountPaid: string;
  extraCost: string;
  items: Array<{
    productId: string;
    unitId: number;
    quantityOrdered: number;
    agreedUnitCost: string;
  }>;
};
type Attempt = {
  version: 1;
  userId: string;
  key: string;
  body: PurchaseBody;
  receiveNow: boolean;
};
const attemptKey = (userId: string) => `sb-purchase-create-v1:${userId}`;
export function readPurchaseAttempt(userId: string): Attempt | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(attemptKey(userId)) || "null",
    );
    return value?.version === 1 &&
      value.userId === userId &&
      value.key &&
      value.body &&
      Array.isArray(value.body.items)
      ? value
      : null;
  } catch {
    return null;
  }
}
async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const response = await cachedRequest<ApiList<T>>(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page}`,
    );
    rows.push(...response.data);
    if (!response.pagination || page >= response.pagination.totalPages)
      return rows;
    page++;
  }
}
function total(lines: Line[]): bigint | null {
  let amount = 0n;
  for (const line of lines) {
    const cost = decimal(line.cost),
      count = quantity(line.quantity);
    if (cost === null || count === null) return null;
    amount += cost * BigInt(count);
  }
  return amount;
}
function display(value: bigint | null) {
  return value === null ? "—" : money(decimalString(value));
}
function valid(lines: Line[], paid: string): string {
  if (!lines.length) return "Add at least one product.";
  const seen = new Set<string>();
  for (const line of lines) {
    if (quantity(line.quantity) === null)
      return "Enter a whole quantity of at least 1 for every product.";
    if (decimal(line.cost) === null)
      return "Enter a valid unit cost with at most four decimal places.";
    const key = `${line.productId}:${line.unitId}`;
    if (seen.has(key))
      return "This product and unit are already in the basket. Adjust its existing line.";
    seen.add(key);
  }
  if (decimal(paid) === null)
    return "Enter the amount already paid, or 0 if unpaid.";
  return "";
}
export function PurchaseCreate({
  userId,
  canCreateContacts,
  close,
  done,
}: {
  userId: string;
  canCreateContacts: boolean;
  close: () => void;
  done: (id: number, receiveNow: boolean) => void;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(() =>
    readPurchaseAttempt(userId),
  );
  const [supplierId, setSupplierId] = useState(""),
    [createdSupplier, setCreatedSupplier] = useState<Contact | null>(null),
    [contactOpen, setContactOpen] = useState(false),
    [productId, setProductId] = useState(""),
    [selectedUnitId, setUnitId] = useState("");
  const [addQuantity, setAddQuantity] = useState("1"),
    [lines, setLines] = useState<Line[]>([]),
    [paid, setPaid] = useState("0");
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({
    queryKey: ["purchase-suppliers", userId],
    queryFn: () => allPages<Contact>("/contacts/?type=SUPPLIER"),
  });
  const productsQuery = useQuery({
    queryKey: ["purchase-products", userId],
    queryFn: () => allPages<Product>("/catalog/products"),
  });
  const unitsQuery = useQuery({
    queryKey: ["product-units", userId, productId],
    queryFn: async () =>
      (
        await cachedRequest<{ data: Unit[] }>(
          `/catalog/products/${productId}/units`,
        )
      ).data,
    enabled: !!productId,
  });
  const units = unitsQuery.data || [],
    unitId = selectedUnitId || (units.length === 1 ? String(units[0].id) : "");
  const amount = total(lines),
    paidAmount = decimal(paid),
    fullyPaid = amount !== null && paidAmount !== null && paidAmount >= amount;
  const validation = valid(lines, paid);
  function add() {
    const product = productsQuery.data?.find((item) => item.id === productId),
      unit = units.find((item) => item.id === Number(unitId));
    if (!product || !unit || quantity(addQuantity) === null) return;
    if (
      lines.some(
        (line) => line.productId === product.id && line.unitId === unit.id,
      )
    ) {
      setError(
        "This product and unit are already in the basket. Adjust its existing line.",
      );
      return;
    }
    setLines((current) => [
      ...current,
      {
        id: newKey(),
        productId: product.id,
        productName: product.name,
        unitId: unit.id,
        unitName: unit.name,
        quantity: addQuantity,
        cost: unit.price,
      },
    ]);
    setProductId("");
    setUnitId("");
    setAddQuantity("1");
    setError("");
  }
  function update(id: string, change: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...change } : line)),
    );
    setError("");
  }
  function makeBody(): PurchaseBody {
    if (validation) throw Error(validation);
    return {
      supplierId: supplierId || null,
      transactionStatus: fullyPaid ? "COMPLETED" : "PENDING",
      amountPaid: paid,
      extraCost: "0",
      items: lines.map((line) => ({
        productId: line.productId,
        unitId: line.unitId,
        quantityOrdered: quantity(line.quantity)!,
        agreedUnitCost: line.cost,
      })),
    };
  }
  async function confirm(receiveNow: boolean) {
    if (busy) return;
    let current = attempt;
    try {
      if (!current) {
        current = {
          version: 1,
          userId,
          key: newKey(),
          body: makeBody(),
          receiveNow,
        };
        sessionStorage.setItem(attemptKey(userId), JSON.stringify(current));
        setAttempt(current);
      }
      if (!navigator.onLine)
        throw new ApiError(
          0,
          "Reconnect, then retry this purchase. It will not be sent automatically.",
        );
      setBusy(true);
      setError("");
      const response = await command<{ data: { purchase: { id: number } } }>(
        "/purchase/create",
        current.body,
        current.key,
      );
      const id = response.data.purchase.id;
      if (!Number.isSafeInteger(id) || id < 1)
        throw Error(
          "The server did not return a valid purchase ID. Retry to recover this purchase.",
        );
      sessionStorage.removeItem(attemptKey(userId));
      setAttempt(null);
      done(id, current.receiveNow);
    } catch (e) {
      const failure = e as ApiError;
      setError(failure.message);
      if (current && [400, 403].includes(failure.status)) {
        sessionStorage.removeItem(attemptKey(userId));
        setAttempt(null);
        setReview(false);
      }
    } finally {
      setBusy(false);
    }
  }
  if (attempt)
    return (
      <div className="sale-composer">
        <div className="panel sale-result">
          <h1>Resume purchase confirmation</h1>
          <p>
            The server may have saved this purchase. Retry with the same request
            to recover its result.
          </p>
          <p>
            {attempt.body.items.length} product lines ·{" "}
            {money(attempt.body.amountPaid)} already paid
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <button
            className="primary"
            disabled={busy || !navigator.onLine}
            onClick={() => confirm(attempt.receiveNow)}
          >
            {busy ? "Checking…" : "Retry same purchase"}
          </button>
        </div>
      </div>
    );
  return (
    <div className="sale-composer">
      <button className="back" onClick={close}>
        <ArrowLeft size={17} />
        All purchases
      </button>
      <div className="page-head">
        <div>
          <div className="eyebrow">PURCHASING / NEW PURCHASE</div>
          <h1>Build a purchase</h1>
          <p>
            Add the products you are ordering, then choose when to receive them.
          </p>
        </div>
        <span className="sale-unsaved">Not recorded yet</span>
      </div>
      <ol className="sale-steps" aria-label="Purchase creation steps">
        <li aria-current={!review ? "step" : undefined}>
          <span>1</span>Products
        </li>
        <li aria-current={review ? "step" : undefined}>
          <span>2</span>Review &amp; choose
        </li>
      </ol>
      {productsQuery.isPending ? (
        <div className="panel state" role="status">
          Loading products…
        </div>
      ) : productsQuery.isError ? (
        <div className="panel state">
          <p>{productsQuery.error.message}</p>
          <button onClick={() => productsQuery.refetch()}>
            <RefreshCw size={16} />
            Retry products
          </button>
        </div>
      ) : (
        <>
          {!review ? (
            <>
              <div className="sale-buyer">
                <label>
                  Supplier (optional)
                  <AppSelect
                    value={supplierId}
                    onValueChange={setSupplierId}
                    options={[
                      { value: "", label: "Unassigned supplier" },
                      ...(createdSupplier &&
                      supplierId === createdSupplier.id &&
                      !suppliersQuery.data?.some(
                        (item) => item.id === createdSupplier.id,
                      )
                        ? [
                            {
                              value: createdSupplier.id,
                              label: createdSupplier.name,
                            },
                          ]
                        : []),
                      ...(suppliersQuery.data || []).map((item) => ({
                        value: item.id,
                        label: item.name,
                      })),
                    ]}
                  />
                </label>
                {canCreateContacts && (
                  <button
                    type="button"
                    className="sale-text-button"
                    onClick={() => setContactOpen(true)}
                  >
                    + Add new supplier
                  </button>
                )}
                {suppliersQuery.isError && (
                  <p className="sale-help" role="status">
                    Suppliers could not be loaded. You can continue unassigned.{" "}
                    <button
                      className="sale-text-button"
                      onClick={() => suppliersQuery.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                )}
                <p className="sale-help">
                  The current backend cannot attach a supplier after creation.
                  Choose one now if you will need it on this purchase.
                </p>
              </div>
              <div className="panel sale-basket-panel">
                <div className="panel-head">
                  <h2>Products in this purchase</h2>
                  <span className="sale-help">
                    {lines.length} product{" "}
                    {lines.length === 1 ? "line" : "lines"}
                  </span>
                </div>
                <div className="purchase-add-product">
                  <label>
                    Product
                    <AppSelect
                      aria-label="Purchase product to add"
                      value={productId}
                      onValueChange={(value) => {
                        setProductId(value);
                        setUnitId("");
                      }}
                      placeholder="Choose product"
                      options={productsQuery.data.map((product) => ({
                        value: product.id,
                        label: product.name,
                      }))}
                    />
                  </label>
                  <label>
                    Product unit
                    <AppSelect
                      aria-label="Purchase unit to add"
                      value={unitId}
                      onValueChange={setUnitId}
                      disabled={!productId || unitsQuery.isFetching}
                      placeholder="Choose unit"
                      options={units.map((unit) => ({
                        value: String(unit.id),
                        label: `${unit.name} · ${unit.sku}`,
                      }))}
                    />
                  </label>
                  <label>
                    Quantity
                    <input
                      aria-label="Purchase quantity to add"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={addQuantity}
                      onChange={(event) => setAddQuantity(event.target.value)}
                    />
                  </label>
                  <button
                    className="subtle"
                    type="button"
                    disabled={
                      !productId || !unitId || quantity(addQuantity) === null
                    }
                    onClick={add}
                  >
                    <Plus size={17} />
                    Add product
                  </button>
                </div>
                {unitsQuery.isError && (
                  <div className="sale-add-error" role="alert">
                    {unitsQuery.error.message}{" "}
                    <button
                      className="sale-text-button"
                      onClick={() => unitsQuery.refetch()}
                    >
                      Retry units
                    </button>
                  </div>
                )}
                {!lines.length ? (
                  <div className="state">
                    <h3>No products added yet</h3>
                    <p>
                      Choose a product, unit and quantity to start this
                      purchase.
                    </p>
                  </div>
                ) : (
                  lines.map((line) => (
                    <article className="purchase-line" key={line.id}>
                      <div className="purchase-line-product">
                        <b>{line.productName}</b>
                        <small>{line.unitName}</small>
                      </div>
                      <label>
                        Ordered
                        <input
                          aria-label={`${line.productName} ordered (${line.unitName})`}
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(event) =>
                            update(line.id, { quantity: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Agreed unit cost · ₦
                        <AmountInput
                          aria-label={`${line.productName} agreed unit cost (${line.unitName})`}
                          value={line.cost}
                          onValueChange={(value) =>
                            update(line.id, { cost: value })
                          }
                        />
                      </label>
                      <div className="purchase-line-total">
                        <span>Line total</span>
                        <b>
                          {quantity(line.quantity) !== null &&
                          decimal(line.cost) !== null
                            ? display(
                                decimal(line.cost)! *
                                  BigInt(quantity(line.quantity)!),
                              )
                            : "—"}
                        </b>
                      </div>
                      <button
                        className="icon"
                        aria-label={`Remove ${line.productName} (${line.unitName})`}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((item) => item.id !== line.id),
                          )
                        }
                      >
                        <X size={17} />
                      </button>
                    </article>
                  ))
                )}
              </div>
              <div className="sale-basket-footer">
                <div>
                  <span>Estimated purchase total</span>
                  <strong>{display(amount)}</strong>
                </div>
                <button
                  className="primary"
                  disabled={!lines.length || amount === null}
                  onClick={() => {
                    setError("");
                    setReview(true);
                  }}
                >
                  Review purchase
                  <ArrowRight size={17} />
                </button>
              </div>
            </>
          ) : (
            <div className="panel purchase-review">
              <h2>Review purchase</h2>
              <p>
                Check all product quantities, the supplier and the amount
                already paid.
              </p>
              <div className="sale-info-row">
                <span>Supplier</span>
                <b>
                  {suppliersQuery.data?.find((item) => item.id === supplierId)
                    ?.name ||
                    (createdSupplier?.id === supplierId
                      ? createdSupplier.name
                      : "Unassigned supplier")}
                </b>
              </div>
              {lines.map((line) => (
                <div className="sale-info-row" key={line.id}>
                  <span>
                    {line.productName} · {line.unitName} × {line.quantity}
                  </span>
                  <b>
                    {quantity(line.quantity) !== null &&
                    decimal(line.cost) !== null
                      ? display(
                          decimal(line.cost)! *
                            BigInt(quantity(line.quantity)!),
                        )
                      : "—"}
                  </b>
                </div>
              ))}
              <div className="sale-info-row">
                <span>Estimated total</span>
                <b>{display(amount)}</b>
              </div>
              <label className="purchase-paid">
                Amount already paid · ₦
                <AmountInput value={paid} onValueChange={setPaid} />
              </label>
              <div className="sale-info-row">
                <span>Commercial status</span>
                <b>{fullyPaid ? "COMPLETED · fully paid" : "PENDING"}</b>
              </div>
              <p className="sale-help">
                Receiving is tracked separately. Payment does not add stock. The
                server confirms final totals and status.
              </p>
              {validation && (
                <div className="alert error" role="alert">
                  {validation}
                </div>
              )}
              {error && (
                <div className="alert error" role="alert">
                  {error}
                </div>
              )}
              <div className="purchase-paths">
                <button className="subtle" onClick={() => setReview(false)}>
                  <ArrowLeft size={16} />
                  Edit products
                </button>
                <button
                  className="subtle"
                  disabled={busy || !!validation}
                  onClick={() => confirm(false)}
                >
                  {busy ? "Saving…" : "Create order · receive later"}
                </button>
                <button
                  className="primary"
                  disabled={busy || !!validation}
                  onClick={() => confirm(true)}
                >
                  {busy ? "Saving…" : "Create & receive now"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
          {!review && error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
        </>
      )}
      {contactOpen && (
        <TransactionContactCreate
          kind="SUPPLIER"
          close={() => {
            setContactOpen(false);
            void suppliersQuery.refetch();
          }}
          created={(contact: TransactionContact) => {
            queryClient.setQueryData<Contact[]>(
              ["purchase-suppliers", userId],
              (current) =>
                current?.some((item) => item.id === contact.id)
                  ? current
                  : [...(current || []), contact],
            );
            setCreatedSupplier(contact);
            setSupplierId(contact.id);
            setContactOpen(false);
            void queryClient.invalidateQueries({
              queryKey: ["purchase-suppliers", userId],
            });
          }}
        />
      )}
    </div>
  );
}
