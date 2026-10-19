import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cachedRequest } from "../query";
import { StockPreview } from "./StockPreview";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Plus,
  RefreshCw,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import {
  ApiError,
  command,
  money,
  newKey,
  request,
  type ApiList,
  type SaleDetail,
  type User,
} from "../api";
import { AppSelect } from "../components/AppSelect";
import { AmountInput } from "../components/AmountInput";
import { statusTone } from "../components/statusTone";
import {
  TransactionContactCreate,
  type TransactionContact,
} from "../components/TransactionContactCreate";
import {
  basketError,
  basketTotal,
  createPayload,
  decimal,
  decimalString,
  lineError,
  lineTotal,
  MAX_QUANTITY,
  paymentError,
  quantity,
  runCheckout,
  type Basket,
  type BasketLine,
  type CheckoutAttempt,
} from "./checkout-model";
import {
  clearAttempt,
  clearBasket,
  emptyBasket,
  readAttempt,
  readBasket,
  writeAttempt,
  writeBasket,
} from "./checkout-storage";

type Contact = { id: string; name: string };
type Product = { id: string; name: string; baseUnit: string };
type Warehouse = { id: number; name: string };
type ProductUnit = { id: number; name: string; sku: string; price: string };
type Failure = { message: string; status?: number; route?: string };

async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const result = await cachedRequest<ApiList<T>>(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page}`,
    );
    rows.push(...result.data);
    if (!result.pagination || page >= result.pagination.totalPages) return rows;
    page++;
  }
}
function displayAmount(value: bigint | null) {
  if (value === null) return "—";
  if (value % 100n === 0n) return money(decimalString(value));
  const [whole, fraction = ""] = decimalString(value).split(".");
  return `₦${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
function later(line: BasketLine) {
  const ordered = quantity(line.quantity),
    now = quantity(line.handover, true);
  return ordered !== null && now !== null && now <= ordered
    ? `${ordered - now} later`
    : "Check quantity";
}
function Steps({ step }: { step: number }) {
  return (
    <ol className="sale-steps" aria-label="Sale creation steps">
      {["Products", "Payment", "Review"].map((label, index) => (
        <li key={label} aria-current={step === index ? "step" : undefined}>
          <span>{index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
function ReviewLines({
  basket,
  warehouses,
}: {
  basket: Basket;
  warehouses: Warehouse[];
}) {
  return (
    <div className="sale-review-lines">
      <div className="sale-review-row sale-review-heading">
        <span>Product / unit</span>
        <span>Ordered</span>
        <span>Now</span>
        <span>Later</span>
      </div>
      {basket.lines.map((line) => (
        <div className="sale-review-row" key={line.id}>
          <div>
            <b>{line.productName}</b>
            <small>
              {line.unitName} ·{" "}
              {warehouses.find((w) => w.id === Number(line.warehouseId))
                ?.name || `Warehouse #${line.warehouseId}`}
            </small>
          </div>
          <span>{line.quantity}</span>
          <span>{line.handover}</span>
          <span>
            {quantity(line.quantity)! - quantity(line.handover, true)!}
          </span>
        </div>
      ))}
    </div>
  );
}
function CheckoutDialog({
  step,
  basket,
  warehouses,
  setPaid,
  close,
  review,
  confirm,
}: {
  step: 1 | 2;
  basket: Basket;
  warehouses: Warehouse[];
  setPaid: (value: string) => void;
  close: () => void;
  review: () => void;
  confirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const paid = decimal(basket.amountPaid),
    total = basketTotal(basket.lines);
  const error = paymentError(basket);
  const hasHandover = basket.lines.some(
    (line) => quantity(line.handover, true)! > 0,
  );
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (step === 2) title.current?.focus();
  }, [step]);
  return createPortal(
    <dialog
      ref={dialog}
      className="sale-checkout-dialog"
      aria-labelledby="sale-checkout-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="sale-checkout-head">
        <div>
          <h2 id="sale-checkout-title" ref={title} tabIndex={-1}>
            {step === 1 ? "Payment details" : "Review before confirming"}
          </h2>
          <p>
            {step === 1
              ? "Record the amount received before confirming the sale."
              : "Check products, money received and goods leaving now."}
          </p>
        </div>
        <button
          className="icon"
          type="button"
          onClick={close}
          aria-label="Return to products"
        >
          <X size={20} />
        </button>
      </div>
      <Steps step={step} />
      <div className="sale-info-row">
        <span>Buyer</span>
        <b>{basket.buyerName}</b>
      </div>
      {step === 1 ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!error) review();
          }}
        >
          <div className="sale-info-row">
            <span>
              Estimated sale total · {basket.lines.length} product lines
            </span>
            <b>{displayAmount(total)}</b>
          </div>
          <label className="sale-payment-label" htmlFor="sale-amount-paid">
            Amount already paid · ₦
          </label>
          <div className="sale-payment-entry">
            <AmountInput
              autoFocus
              id="sale-amount-paid"
              required
              pattern="[0-9]{1,3}(,[0-9]{3})*([.][0-9]{1,4})?"
              aria-invalid={basket.amountPaid !== "" && !!error}
              aria-describedby="sale-payment-error"
              value={basket.amountPaid}
              placeholder="0.00"
              onValueChange={setPaid}
            />
            <button
              type="button"
              className="subtle"
              onClick={() => setPaid(decimalString(total))}
            >
              Paid in full
            </button>
          </div>
          <div className="sale-info-row">
            <span>Balance remaining</span>
            <b>
              {paid !== null && paid > total
                ? "Check amount"
                : displayAmount(total - (paid ?? 0n))}
            </b>
          </div>
          <p id="sale-payment-error" className="sale-field-error" role="alert">
            {basket.amountPaid !== "" ? error : ""}
          </p>
          <p className="sale-notice">
            {basket.lines.some(
              (line) =>
                line.quantity !== line.handover &&
                quantity(line.quantity) !== quantity(line.handover, true),
            )
              ? "Some goods are due for later handover. Payment does not mark those goods as delivered."
              : "All goods are marked for handover now. Confirm they are ready to leave the shop."}
          </p>
          <p className="sale-help">
            Record money already received. This screen does not collect a
            payment. The server confirms the final totals.
          </p>
          <div className="sale-dialog-actions">
            <button className="subtle" type="button" onClick={close}>
              <ArrowLeft size={16} />
              Edit products
            </button>
            <button className="primary" type="submit" disabled={!!error}>
              Review sale
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      ) : (
        <>
          <ReviewLines basket={basket} warehouses={warehouses} />
          <div className="sale-info-row">
            <span>Estimated total</span>
            <b>{displayAmount(total)}</b>
          </div>
          <div className="sale-info-row">
            <span>Amount paid</span>
            <b>{displayAmount(paid)}</b>
          </div>
          <div className="sale-info-row">
            <span>Balance to pay</span>
            <b>{displayAmount(total - (paid ?? 0n))}</b>
          </div>
          <p className="sale-notice">
            {hasHandover
              ? "Confirm that the quantities under “Now” are being handed to the buyer. Only those quantities leave stock. Availability is checked by the server at handover."
              : "No goods are being handed over now. The full order remains due for later handover."}
          </p>
          <button className="sale-text-button" type="button" onClick={close}>
            Edit products or handover quantities
          </button>
          <div className="sale-dialog-actions">
            <button className="subtle" type="button" onClick={review}>
              <ArrowLeft size={16} />
              Back to payment
            </button>
            <button className="primary" type="button" onClick={confirm}>
              {hasHandover ? "Confirm sale & handover" : "Confirm sale"}
            </button>
          </div>
        </>
      )}
    </dialog>,
    document.body,
  );
}

export function SaleComposer({
  user,
  close,
  saved,
}: {
  user: User;
  close: () => void;
  saved: (id: number) => void;
}) {
  const [attempt, setAttempt] = useState<CheckoutAttempt | null>(() =>
    readAttempt(user.id),
  );
  const attemptRef = useRef(attempt);
  const running = useRef(false);
  const [basket, setBasket] = useState<Basket>(
    () => readAttempt(user.id)?.basket || readBasket(user.id),
  );
  const [contactOpen, setContactOpen] = useState(false);
  const queryClient = useQueryClient();
  const buyersQuery = useQuery({
    queryKey: ["sale-buyers", user.id],
    queryFn: () => allPages<Contact>("/contacts/?type=BUYER"),
  });
  const optionsQuery = useQuery({
    queryKey: ["sale-options", user.id],
    queryFn: async () => {
      const [products, warehouses] = await Promise.all([
        allPages<Product>("/catalog/products"),
        allPages<Warehouse>("/warehouses/"),
      ]);
      return { products, warehouses };
    },
  });
  const { products = [], warehouses = [] } = optionsQuery.data || {};
  const contacts = buyersQuery.data || [];
  const loading = optionsQuery.isPending,
    loadError = optionsQuery.error?.message;
  const [productId, setProductId] = useState(""),
    [selectedUnitId, setUnitId] = useState(""),
    [selectedWarehouse, setSelectedWarehouse] = useState(""),
    [addQuantity, setAddQuantity] = useState("1");
  const unitsQuery = useQuery({
    queryKey: ["product-units", user.id, productId],
    queryFn: async () =>
      (
        await cachedRequest<{ data: ProductUnit[] }>(
          `/catalog/products/${productId}/units`,
        )
      ).data,
    enabled: !!productId,
  });
  const units = unitsQuery.data || [];
  const unitId =
    selectedUnitId || (units.length === 1 ? String(units[0].id) : "");
  const warehouseId =
    selectedWarehouse ||
    (warehouses.length === 1 ? String(warehouses[0].id) : "");
  const unitLoading = unitsQuery.isFetching,
    unitError = unitsQuery.error?.message;
  const [step, setStep] = useState<0 | 1 | 2>(0),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<SaleDetail | null>(null),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    writeBasket(user.id, basket);
  }, [basket, user.id]);
  const updateLine = (id: string, change: Partial<BasketLine>) => {
    setFailure(null);
    setBasket((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === id ? { ...line, ...change } : line,
      ),
    }));
  };
  function addProduct() {
    const product = products.find((p) => p.id === productId),
      unit = units.find((u) => u.id === Number(unitId));
    if (!product || !unit || !warehouseId || quantity(addQuantity) === null)
      return;
    if (
      basket.lines.some(
        (line) => line.productId === product.id && line.unitId === unit.id,
      )
    ) {
      setFailure({
        message:
          "This product and unit are already in the basket. Adjust its existing quantity.",
      });
      return;
    }
    setBasket((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: newKey(),
          productId: product.id,
          productName: product.name,
          unitId: unit.id,
          unitName: unit.name,
          sku: unit.sku,
          price: unit.price,
          quantity: addQuantity,
          handover: "0",
          warehouseId,
        },
      ],
    }));
    setProductId("");
    setUnitId("");
    setAddQuantity("1");
    setFailure(null);
  }
  function persist(next: CheckoutAttempt) {
    writeAttempt(next);
    attemptRef.current = next;
    setAttempt(next);
  }
  async function execute(initial: CheckoutAttempt) {
    if (running.current) return;
    if (!navigator.onLine) {
      setFailure({
        message:
          "You are offline. Reconnect, then explicitly retry this confirmation. Nothing will be sent automatically.",
      });
      return;
    }
    running.current = true;
    setBusy(true);
    setFailure(null);
    setStep(0);
    let route = "";
    try {
      const sale = await runCheckout(initial, {
        save: persist,
        newKey,
        create: async (payload, key) => {
          route = "POST /api/v1/sale/create";
          const response = await command<{ data: { sale: { id: number } } }>(
            "/sale/create",
            payload,
            key,
          );
          return response.data.sale;
        },
        read: async (id) => {
          route = `GET /api/v1/sale/${id}`;
          return (await request<{ data: SaleDetail }>(`/sale/${id}`)).data;
        },
        dispatch: (id, payload, key) => {
          route = `POST /api/v1/sale/${id}/dispatches`;
          return command(`/sale/${id}/dispatches`, payload, key);
        },
      });
      clearAttempt(user.id);
      clearBasket(user.id);
      attemptRef.current = null;
      setAttempt(null);
      setResult(sale);
    } catch (error) {
      const apiError = error as ApiError;
      setFailure({ message: apiError.message, status: apiError.status, route });
      // Validation and authorization rejections happen before sale creation.
      if (
        attemptRef.current?.phase === "creating" &&
        [400, 403].includes(apiError.status)
      ) {
        clearAttempt(user.id);
        attemptRef.current = null;
        setAttempt(null);
        setStep(0);
      }
    } finally {
      void queryClient.invalidateQueries({
        queryKey: ["availability", user.id],
      });
      running.current = false;
      setBusy(false);
    }
  }
  function confirmSale() {
    if (running.current) return;
    try {
      const next: CheckoutAttempt = {
        version: 1,
        userId: user.id,
        basket: structuredClone(basket),
        phase: "creating",
        create: { key: newKey(), payload: createPayload(basket) },
      };
      persist(next);
      void execute(next);
    } catch (error) {
      setFailure({ message: (error as Error).message });
    }
  }
  const error = basketError(basket);
  const total = basketTotal(basket.lines);
  if (result)
    return (
      <div className="sale-composer">
        <div className="sale-result panel">
          <div className="sale-result-icon">
            <CheckCircle2 size={26} />
          </div>
          <div className="eyebrow">SALE #{result.id}</div>
          <h1>
            {result.transactionStatus === "COMPLETED"
              ? "Sale completed"
              : "Sale recorded"}
          </h1>
          <p>
            {result.buyer?.name || "Walk-in customer"} ·{" "}
            {result.deliveryStatus === "FULLY_DELIVERED"
              ? "All ordered goods have been handed over."
              : "The remaining goods stay attached to this sale for later handover."}
          </p>
          <div className="sale-result-status">
            <span className={`badge ${statusTone(result.paymentStatus)}`}>
              {result.paymentStatus.replaceAll("_", " ")}
            </span>
            <span className={`badge ${statusTone(result.deliveryStatus)}`}>
              {result.deliveryStatus.replaceAll("_", " ")}
            </span>
          </div>
          <div className="sale-review-row sale-review-heading">
            <span>Product / unit</span>
            <span>Ordered</span>
            <span>Delivered</span>
            <span>Later</span>
          </div>
          {result.items.map((item) => (
            <div className="sale-review-row" key={item.id}>
              <div>
                <b>{item.product.name}</b>
                <small>{item.unit.name}</small>
              </div>
              <span>{item.quantityOrdered}</span>
              <span>{item.quantityDelivered}</span>
              <span>{item.quantityOrdered - item.quantityDelivered}</span>
            </div>
          ))}
          <div className="sale-info-row">
            <span>Confirmed total</span>
            <b>{money(result.totalSaleAmount)}</b>
          </div>
          <div className="sale-info-row">
            <span>Amount paid</span>
            <b>{money(result.amountPaid)}</b>
          </div>
          <div className="sale-dialog-actions">
            <button
              className="subtle"
              onClick={() => {
                setResult(null);
                setBasket(emptyBasket());
              }}
            >
              New sale
            </button>
            <button className="primary" onClick={() => saved(result.id)}>
              View sale
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  if (attempt)
    return (
      <div className="sale-composer">
        <div className="sale-result panel">
          <div className="sale-result-icon">
            {busy ? (
              <RefreshCw className="sale-spinner" size={24} />
            ) : (
              <Truck size={24} />
            )}
          </div>
          <h1>
            {busy
              ? "Confirming your sale…"
              : attempt.saleId
                ? `Sale #${attempt.saleId} is saved`
                : "Resume sale confirmation"}
          </h1>
          <p role="status">
            {attempt.phase === "creating"
              ? "We need to confirm whether the server saved this order. Retrying continues the same sale."
              : attempt.phase === "confirmed"
                ? "The sale and requested handover are confirmed. Refresh to load their final details."
                : "The order is saved. Its requested handover still needs confirmation; another sale will not be created."}
          </p>
          <ReviewLines basket={attempt.basket} warehouses={warehouses} />
          {failure && (
            <div className="alert error" role="alert">
              {failure.status === 403 && <b>Permission denied. </b>}
              {failure.message}
              {failure.route && (
                <details>
                  <summary>Request details</summary>
                  {failure.route}
                  {failure.status
                    ? ` · ${failure.status}`
                    : " · network failure"}
                </details>
              )}
            </div>
          )}
          {!online && (
            <p className="sale-notice">
              You are offline. This command will not be replayed automatically.
            </p>
          )}
          <div className="sale-dialog-actions">
            <span className="sale-help">
              Keep this confirmation until its outcome is known.
            </span>
            <button
              className="primary"
              disabled={busy || !online}
              onClick={() => execute(attempt)}
            >
              {busy
                ? "Confirming…"
                : attempt.phase === "confirmed"
                  ? "Refresh saved sale"
                  : attempt.saleId
                    ? "Retry this handover"
                    : "Retry confirmation"}
            </button>
          </div>
          {!busy &&
            attempt.saleId &&
            (attempt.phase === "confirmed" ||
              attempt.phase === "created" ||
              (!!failure?.status &&
                failure.status >= 400 &&
                failure.status < 500 &&
                !failure.message.toLowerCase().includes("idempotency"))) && (
              <button
                className="sale-text-button"
                onClick={() => {
                  clearAttempt(user.id);
                  clearBasket(user.id);
                  saved(attempt.saleId!);
                }}
              >
                Open the saved sale without retrying
              </button>
            )}
        </div>
      </div>
    );
  return (
    <div className="sale-composer">
      <button className="back" onClick={close}>
        <ArrowLeft size={17} />
        All sales
      </button>
      <div className="page-head">
        <div>
          <div className="eyebrow">SALES / NEW SALE</div>
          <h1>Build the buyer’s sale</h1>
          <p>Add every product and set what the buyer takes now.</p>
        </div>
        <span className="sale-unsaved">Not recorded yet</span>
      </div>
      <Steps step={0} />
      {loading ? (
        <div className="panel state" role="status">
          Loading products and warehouses…
        </div>
      ) : loadError ? (
        <div className="panel state">
          <h3>Could not load sale options</h3>
          <p>{loadError}</p>
          <button onClick={() => optionsQuery.refetch()}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="sale-buyer">
            <label>
              Buyer (optional)
              <AppSelect
                value={basket.buyerId}
                onValueChange={(value) =>
                  setBasket((current) => ({
                    ...current,
                    buyerId: value,
                    buyerName:
                      contacts.find((c) => c.id === value)?.name ||
                      "Walk-in customer",
                  }))
                }
                options={[
                  { value: "", label: "Walk-in customer" },
                  ...(basket.buyerId &&
                  !contacts.some((contact) => contact.id === basket.buyerId)
                    ? [{ value: basket.buyerId, label: basket.buyerName }]
                    : []),
                  ...contacts.map((contact) => ({
                    value: contact.id,
                    label: contact.name,
                  })),
                ]}
              />
            </label>
            {["ADMIN", "MANAGER"].includes(user.role) && (
              <button
                type="button"
                className="sale-text-button"
                onClick={() => setContactOpen(true)}
              >
                + Add new buyer
              </button>
            )}
            <p className="sale-help">
              Leave as “Walk-in customer” for an anonymous sale. No contact is
              created.
            </p>
            {buyersQuery.isError && (
              <p className="sale-help" role="status">
                Saved buyers are unavailable. Walk-in sales still work.{" "}
                <button
                  type="button"
                  className="sale-text-button"
                  onClick={() => buyersQuery.refetch()}
                >
                  Retry buyers
                </button>
              </p>
            )}
          </div>
          <div className="panel sale-basket-panel">
            <div className="panel-head">
              <h2>Products in this sale</h2>
              <span className="sale-help">
                {basket.lines.length} product{" "}
                {basket.lines.length === 1 ? "line" : "lines"}
              </span>
            </div>
            <div className="sale-add-product">
              <label>
                Product
                <AppSelect
                  aria-label="Product to add"
                  value={productId}
                  onValueChange={(value) => {
                    setProductId(value);
                    setUnitId("");
                  }}
                  placeholder="Choose product"
                  options={products.map((product) => ({
                    value: product.id,
                    label: product.name,
                  }))}
                />
              </label>
              <label>
                Product unit
                <AppSelect
                  aria-label="Unit to add"
                  value={unitId}
                  onValueChange={setUnitId}
                  disabled={!productId || unitLoading}
                  placeholder={unitLoading ? "Loading units…" : "Choose unit"}
                  options={units.map((unit) => ({
                    value: String(unit.id),
                    label: `${unit.name} · ${unit.sku}`,
                  }))}
                />
              </label>
              <label>
                Warehouse
                <AppSelect
                  aria-label="Warehouse before adding"
                  value={warehouseId}
                  onValueChange={setSelectedWarehouse}
                  placeholder="Choose warehouse"
                  options={warehouses.map((warehouse) => ({
                    value: String(warehouse.id),
                    label: warehouse.name,
                  }))}
                />
              </label>
              <label>
                Quantity
                <input
                  aria-label="Quantity to add"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_QUANTITY}
                  step="1"
                  value={addQuantity}
                  onChange={(event) => setAddQuantity(event.target.value)}
                />
              </label>
              <button
                className="subtle"
                type="button"
                onClick={addProduct}
                disabled={
                  !productId ||
                  !unitId ||
                  !warehouseId ||
                  unitLoading ||
                  quantity(addQuantity) === null
                }
              >
                <Plus size={17} />
                Add product
              </button>
            </div>
            <div className="sale-add-stock">
              <StockPreview
                userId={user.id}
                productId={productId}
                unitId={Number(unitId)}
                warehouseId={warehouseId}
                ordered={addQuantity}
                unitName={
                  units.find((unit) => unit.id === Number(unitId))?.name ||
                  "selected unit"
                }
              />
            </div>
            {unitError && (
              <div className="sale-add-error" role="alert">
                {unitError}
                <button
                  type="button"
                  className="sale-text-button"
                  onClick={() => unitsQuery.refetch()}
                >
                  Retry units
                </button>
              </div>
            )}
            {!products.length && (
              <div className="empty-inline">
                No products are available yet. Ask an administrator or manager
                to add products and units.
              </div>
            )}
            {!warehouses.length && (
              <div className="empty-inline">
                A warehouse is required to plan the sale. Ask an administrator
                or manager to add one.
              </div>
            )}
            {!basket.lines.length ? (
              <div className="state">
                <ShoppingCart size={30} />
                <h3>Your basket is empty</h3>
                <p>Add the products the buyer is purchasing.</p>
              </div>
            ) : (
              basket.lines.map((line) => (
                <article className="sale-basket-line" key={line.id}>
                  <div className="sale-line-product">
                    <div className="sale-line-name">
                      <b title={line.productName}>{line.productName}</b>
                      <small>
                        {line.unitName} · {line.sku}
                      </small>
                    </div>
                    <AppSelect
                      aria-label={`${line.productName} warehouse (${line.unitName})`}
                      value={line.warehouseId}
                      onValueChange={(value) =>
                        updateLine(line.id, { warehouseId: value })
                      }
                      placeholder="Choose warehouse"
                      options={warehouses.map((warehouse) => ({
                        value: String(warehouse.id),
                        label: warehouse.name,
                      }))}
                    />
                  </div>
                  <label className="sale-line-ordered">
                    <span>Ordered</span>
                    <input
                      aria-label={`${line.productName} ordered (${line.unitName})`}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max={MAX_QUANTITY}
                      step="1"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.id, { quantity: event.target.value })
                      }
                    />
                  </label>
                  <label className="sale-line-handover">
                    <span>Hand over now</span>
                    <input
                      aria-label={`${line.productName} hand over now (${line.unitName})`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={quantity(line.quantity) ?? MAX_QUANTITY}
                      step="1"
                      value={line.handover}
                      aria-invalid={
                        quantity(line.handover, true) === null ||
                        quantity(line.handover, true)! >
                          (quantity(line.quantity) ?? 0)
                      }
                      onChange={(event) =>
                        updateLine(line.id, { handover: event.target.value })
                      }
                    />
                    <small>{later(line)}</small>
                  </label>
                  <label className="sale-line-price">
                    <span>Unit price · ₦</span>
                    <AmountInput
                      aria-label={`${line.productName} unit price (${line.unitName})`}
                      value={line.price}
                      onValueChange={(value) =>
                        updateLine(line.id, { price: value })
                      }
                    />
                  </label>
                  <div className="sale-line-total">
                    <span>Line total</span>
                    <b>{displayAmount(lineTotal(line))}</b>
                  </div>
                  <button
                    className="icon sale-line-remove"
                    type="button"
                    aria-label={`Remove ${line.productName} (${line.unitName})`}
                    onClick={() =>
                      setBasket((current) => ({
                        ...current,
                        lines: current.lines.filter(
                          (item) => item.id !== line.id,
                        ),
                      }))
                    }
                  >
                    <X size={17} />
                  </button>
                  {lineError(line) && (
                    <p className="sale-line-error" role="alert">
                      {lineError(line)}
                    </p>
                  )}
                  <div className="sale-line-stock">
                    <StockPreview
                      userId={user.id}
                      productId={line.productId}
                      unitId={line.unitId}
                      warehouseId={line.warehouseId}
                      ordered={line.quantity}
                      unitName={line.unitName}
                    />
                  </div>
                </article>
              ))
            )}
          </div>
          {failure && (
            <div className="alert error" role="alert">
              {failure.status === 403 && <b>Permission denied. </b>}
              {failure.message}
              {failure.route && (
                <details>
                  <summary>Request details</summary>
                  {failure.route} · {failure.status || "network failure"}
                </details>
              )}
            </div>
          )}
          {basket.lines.length > 0 && (
            <div className="sale-handover-actions">
              <button
                type="button"
                className="sale-text-button"
                onClick={() =>
                  setBasket((current) => ({
                    ...current,
                    lines: current.lines.map((line) => ({
                      ...line,
                      handover: line.quantity,
                    })),
                  }))
                }
              >
                <Check size={15} />
                Taking everything now
              </button>
              <span>or set a different handover quantity on each line</span>
            </div>
          )}
          <p className="sale-help">
            “Later” is the quantity still owed to the buyer. It is not a return.
          </p>
          <div className="sale-basket-footer">
            <div>
              <span>Estimated sale total</span>
              <strong>{displayAmount(total)}</strong>
            </div>
            <button
              className="primary"
              disabled={!!error}
              onClick={() => {
                setFailure(null);
                setStep(1);
              }}
            >
              Continue to payment
              <ArrowRight size={17} />
            </button>
          </div>
          <p className="sale-help">
            Nothing is recorded until you confirm the final review. The server
            calculates final totals and stock changes.
          </p>
        </>
      )}
      {step !== 0 && (
        <CheckoutDialog
          step={step}
          basket={basket}
          warehouses={warehouses}
          setPaid={(value) =>
            setBasket((current) => ({ ...current, amountPaid: value }))
          }
          close={() => setStep(0)}
          review={() => setStep((current) => (current === 1 ? 2 : 1))}
          confirm={confirmSale}
        />
      )}
      {contactOpen && (
        <TransactionContactCreate
          kind="BUYER"
          close={() => {
            setContactOpen(false);
            void buyersQuery.refetch();
          }}
          created={(contact: TransactionContact) => {
            queryClient.setQueryData<Contact[]>(
              ["sale-buyers", user.id],
              (current) =>
                current?.some((item) => item.id === contact.id)
                  ? current
                  : [...(current || []), contact],
            );
            setBasket((current) => ({
              ...current,
              buyerId: contact.id,
              buyerName: contact.name,
            }));
            setContactOpen(false);
            void queryClient.invalidateQueries({
              queryKey: ["sale-buyers", user.id],
            });
          }}
        />
      )}
    </div>
  );
}
