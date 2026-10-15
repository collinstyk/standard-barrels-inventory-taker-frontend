import { AppSelect } from "./components/AppSelect";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./query";
import { SaleComposer } from "./sales/SaleComposer";
import { decimal } from "./sales/checkout-model";
import { readAttempt } from "./sales/checkout-storage";
import "./tailwind.css";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Boxes,
  ShoppingCart,
  Truck,
  PackageCheck,
  RotateCcw,
  Users,
  Tags,
  Package,
  Warehouse,
  ChartNoAxesCombined,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  ArrowLeft,
  Plus,
  RefreshCw,
  Search,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import {
  ApiError,
  command,
  date,
  money,
  newKey,
  request,
  session,
  type ApiList,
  type SaleDetail,
  type SaleList,
  type User,
} from "./api";
import { PurchaseCreate, readPurchaseAttempt } from "./PurchaseCreate";
import { ReceiptModal } from "./PurchaseReceipt";
import { CustomerReturns } from "./CustomerReturns";
import { ProductCreate, UnitCreate, EditRecord } from "./MasterForms";
import { SupplierReturns } from "./SupplierReturns";
import { InviteStaff, AcceptInvite } from "./Invitations";
type Page =
  | "Sales"
  | "Purchases"
  | "Inventory"
  | "Contacts"
  | "Categories"
  | "Products"
  | "Warehouses"
  | "Supplier returns"
  | "Customer returns"
  | "Staff invitations";
type Entity = {
  id: string | number;
  name?: string;
  status?: string;
  [key: string]: any;
};
const nav: [Page, React.ReactNode][] = [
  ["Sales", <ShoppingCart />],
  ["Purchases", <PackageCheck />],
  ["Inventory", <ChartNoAxesCombined />],
  ["Contacts", <Users />],
  ["Categories", <Tags />],
  ["Products", <Package />],
  ["Warehouses", <Warehouse />],
  ["Supplier returns", <RotateCcw />],
  ["Customer returns", <RotateCcw />],
  ["Staff invitations", <Users />],
];
function status(value: string | undefined) {
  return (
    <span
      className={
        "badge " +
        (value === "COMPLETED" ||
        value === "FULLY_DELIVERED" ||
        value === "FULLY_RECEIVED" ||
        value === "POSTED"
          ? "good"
          : value === "CANCELLED"
            ? "bad"
            : "neutral")
      }
    >
      {value?.replaceAll("_", " ") || "—"}
    </span>
  );
}
function stateMessage(error: unknown, retry: () => void) {
  const e = error as ApiError;
  return (
    <div className="state">
      <ShieldAlert size={28} />
      <h3>
        {e?.status === 403
          ? "Permission denied"
          : e?.status === 0
            ? "Connection lost"
            : "Could not load data"}
      </h3>
      <p>{e?.message || "Please try again."}</p>
      <button onClick={retry}>
        <RefreshCw size={16} /> Retry
      </button>
    </div>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(() => session.user()),
    [restoring, setRestoring] = useState(() => !!session.get()),
    [restoreError, setRestoreError] = useState<unknown>(null),
    [restoreAttempt, setRestoreAttempt] = useState(0),
    [theme, setTheme] = useState(localStorage.getItem("sb-theme") || "light"),
    [page, setPage] = useState<Page>("Sales"),
    [mobile, setMobile] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("sb-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else {
      // Old shell caches must not serve stale Vite modules during development.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          const scriptURL = new URL("/sw.js", location.origin).href;
          return Promise.all(
            registrations
              .filter((registration) =>
                [
                  registration.active,
                  registration.waiting,
                  registration.installing,
                ].some((worker) => worker?.scriptURL === scriptURL),
              )
              .map((registration) => registration.unregister()),
          );
        })
        .catch(() => {});
      if ("caches" in window)
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("sb-shell-"))
                .map((key) => caches.delete(key)),
            ),
          )
          .catch(() => {});
    }
  }, []);
  useEffect(() => session.subscribe(() => setUser(session.user())), []);
  useEffect(() => {
    if (!session.get()) {
      setRestoring(false);
      return;
    }
    let active = true;
    setRestoring(true);
    setRestoreError(null);
    // No /auth/me route exists. This verified read endpoint permits all roles.
    request("/sale/?limit=1")
      .then(() => {
        if (active) setRestoring(false);
      })
      .catch((error) => {
        if (!active) return;
        if ((error as ApiError).status !== 401) setRestoreError(error);
        setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [restoreAttempt]);
  if (restoring || (user && restoreError))
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>
            {restoring ? "Restoring your session…" : "Could not reconnect"}
          </h1>
          {restoring ? (
            <p role="status">Checking your saved login with the server.</p>
          ) : (
            <>
              <p role="alert">{(restoreError as Error).message}</p>
              <button
                className="primary"
                onClick={() => setRestoreAttempt((value) => value + 1)}
              >
                Retry connection
              </button>
              <button
                className="subtle"
                onClick={() => {
                  session.set(null);
                  setRestoreError(null);
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  return (
    <div className="shell">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <div className="brand">
          <div className="brand-icon">
            <Boxes size={24} />
          </div>
          <div>
            <strong>Standard Barrels</strong>
            <small>INVENTORY TAKER</small>
          </div>
          <button
            className="mobile-close icon"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav
            .filter(
              ([name]) => name !== "Staff invitations" || user.role === "ADMIN",
            )
            .map(([name, icon]) => (
              <button
                key={name}
                className={page === name ? "active" : ""}
                onClick={() => {
                  setPage(name);
                  setMobile(false);
                }}
              >
                {icon}
                <span>{name}</span>
              </button>
            ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
          <button
            className="icon"
            onClick={() => {
              session.set(null);
              setUser(null);
            }}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
      <div className="main">
        <header className="topbar">
          <button
            className="mobile-menu icon"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumbs">
            Workspace <ChevronRight size={15} /> <b>{page}</b>
          </div>
          <div className="top-actions">
            <span className="live-dot" />{" "}
            <span className="desktop-only">Connected workspace</span>
            <button
              className="icon theme-toggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label="Toggle colour mode"
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
          </div>
        </header>
        <main>
          {page === "Staff invitations" ? (
            <InviteStaff />
          ) : page === "Sales" ? (
            <Sales user={user} />
          ) : page === "Purchases" ? (
            <Purchases user={user} />
          ) : page === "Inventory" ? (
            <Inventory user={user} />
          ) : (
            <Directory page={page} user={user} />
          )}
        </main>
      </div>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const inviteToken = new URLSearchParams(window.location.hash.slice(1)).get(
    "invite",
  );
  if (inviteToken)
    return <AcceptInvite token={inviteToken} onAccepted={onLogin} />;
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await request<{ token: string; data: { user: User } }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      session.set(r.token, r.data.user);
      onLogin(r.data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand-icon large">
          <Boxes size={32} />
        </div>
        <div className="eyebrow">STANDARD BARRELS</div>
        <h1>Inventory, in clear view.</h1>
        <p>
          Sign in to manage sales, stock, purchasing and warehouse activity.
        </p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <small>Secure access for authorized Standard Barrels staff.</small>
      </div>
    </div>
  );
}
function Sales({ user }: { user: User }) {
  const [rows, setRows] = useState<SaleList[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<unknown>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [creating, setCreating] = useState(
      () => user.role !== "AUDITOR" && !!readAttempt(user.id),
    ),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ page: String(page), limit: "20" });
      if (search.trim()) q.set("search", search.trim());
      if (filter) q.set("deliveryStatus", filter);
      const r = await request<ApiList<SaleList>>(`/sale/?${q}`);
      setRows(r.data);
      setPages(r.pagination?.totalPages || 1);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [page, search, filter]);
  if (creating)
    return (
      <SaleComposer
        user={user}
        close={() => {
          setCreating(false);
          load();
        }}
        saved={(id) => {
          setCreating(false);
          setSelected(id);
        }}
      />
    );
  if (selected !== null)
    return (
      <SaleView
        id={selected}
        user={user}
        back={() => {
          setSelected(null);
          load();
        }}
      />
    );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">COMMERCIAL / SALES</div>
          <h1>Sales</h1>
          <p>
            Track orders, payments and the quantities dispatched from each
            warehouse.
          </p>
        </div>
        {user.role !== "AUDITOR" && (
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> New sale
          </button>
        )}
      </div>
      <div className="summary-grid">
        <div className="summary">
          <span>Sales on this page</span>
          <strong>{rows.length}</strong>
          <small>Latest orders</small>
        </div>
        <div className="summary">
          <span>Awaiting dispatch</span>
          <strong>
            {rows.filter((r) => r.deliveryStatus === "NOT_DELIVERED").length}
          </strong>
          <small>Not yet delivered</small>
        </div>
        <div className="summary">
          <span>Partially delivered</span>
          <strong>
            {rows.filter((r) => r.deliveryStatus === "PARTLY_DELIVERED").length}
          </strong>
          <small>Dispatch remaining</small>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Sale orders</h2>
            <p>Live records from the inventory service</p>
          </div>
          <button className="subtle" onClick={load}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search sales"
              placeholder="Search buyer or sale ID"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <AppSelect
            aria-label="Filter delivery status"
            value={filter}
            onValueChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            options={[
              { value: "", label: <>All delivery states</> },
              { value: "NOT_DELIVERED", label: <>NOT_DELIVERED</> },
              { value: "PARTLY_DELIVERED", label: <>PARTLY_DELIVERED</> },
              { value: "FULLY_DELIVERED", label: <>FULLY_DELIVERED</> },
            ]}
          />
        </div>
        {loading ? (
          <div className="state">Loading sales…</div>
        ) : error ? (
          stateMessage(error, load)
        ) : rows.length === 0 ? (
          <div className="state">
            <ShoppingCart size={30} />
            <h3>No sales found</h3>
            <p>Try another search or create a sale.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sale</th>
                  <th>Buyer</th>
                  <th>Created</th>
                  <th>Commercial</th>
                  <th>Payment</th>
                  <th>Delivery</th>
                  <th className="right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => setSelected(r.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(r.id)}
                  >
                    <td>
                      <b>#{r.id}</b>
                      <small>
                        {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
                      </small>
                    </td>
                    <td>{r.buyer?.name || "Walk-in customer"}</td>
                    <td>{date(r.createdAt)}</td>
                    <td>{status(r.transactionStatus)}</td>
                    <td>{status(r.paymentStatus)}</td>
                    <td>{status(r.deliveryStatus)}</td>
                    <td className="right amount">{money(r.totalSaleAmount)}</td>
                    <td>
                      <ChevronRight size={17} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            Page {page} of {pages}
          </span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
function SaleView({
  id,
  user,
  back,
}: {
  id: number;
  user: User;
  back: () => void;
}) {
  const [data, setData] = useState<SaleDetail | null>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(true),
    [dispatch, setDispatch] = useState(false),
    [updating, setUpdating] = useState(false);
  async function load() {
    setBusy(true);
    setError(null);
    try {
      const r = await request<{ data: SaleDetail }>(`/sale/${id}`);
      setData(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  return (
    <>
      <button className="back" onClick={back}>
        <ArrowLeft size={17} /> All sales
      </button>
      {busy ? (
        <div className="state">Loading sale…</div>
      ) : error ? (
        stateMessage(error, load)
      ) : (
        data && (
          <>
            <div className="page-head">
              <div>
                <div className="eyebrow">SALE ORDER / #{data.id}</div>
                <h1>Sale #{data.id}</h1>
                <p>
                  {data.buyer?.name || "Walk-in customer"} · Created{" "}
                  {date(data.createdAt)}
                </p>
              </div>
              <div className="head-actions">
                {user.role !== "AUDITOR" &&
                  data.deliveryStatus !== "FULLY_DELIVERED" &&
                  data.transactionStatus !== "CANCELLED" &&
                  data.transactionStatus !== "DRAFT" && (
                    <button
                      className="primary"
                      onClick={() => setDispatch(true)}
                    >
                      <Truck size={18} /> Dispatch stock
                    </button>
                  )}
                {["ADMIN", "MANAGER"].includes(user.role) && (
                  <button className="subtle" onClick={() => setUpdating(true)}>
                    Update commercial
                  </button>
                )}
              </div>
            </div>
            <div className="summary-grid">
              <div className="summary">
                <span>Order total</span>
                <strong className="money">{money(data.totalSaleAmount)}</strong>
                <small>Backend calculated</small>
              </div>
              <div className="summary">
                <span>Payment status</span>
                <strong className="status-large">
                  {data.paymentStatus.replaceAll("_", " ")}
                </strong>
                <small>Paid: {money(data.amountPaid)}</small>
              </div>
              <div className="summary">
                <span>Delivery status</span>
                <strong className="status-large">
                  {data.deliveryStatus.replaceAll("_", " ")}
                </strong>
                <small>Commercial: {data.transactionStatus}</small>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Order lines</h2>
                  <p>
                    Ordered, dispatched and remaining quantities in the selected
                    ProductUnit.
                  </p>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit</th>
                      <th className="right">Ordered</th>
                      <th className="right">Dispatched</th>
                      <th className="right">Remaining</th>
                      <th className="right">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <b>{item.product.name}</b>
                          <small>{item.unit.sku}</small>
                        </td>
                        <td>{item.unit.name}</td>
                        <td className="right">{item.quantityOrdered}</td>
                        <td className="right">{item.quantityDelivered}</td>
                        <td className="right">
                          <b>{item.quantityOrdered - item.quantityDelivered}</b>
                        </td>
                        <td className="right">
                          {money(item.confirmedUnitSalePrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Dispatch history</h2>
                  <p>Confirmed stock issues are recorded here.</p>
                </div>
              </div>
              {data.dispatches.length === 0 ? (
                <div className="empty-inline">
                  No dispatches yet. Creating or activating a sale does not
                  deduct stock.
                </div>
              ) : (
                <div className="history">
                  {data.dispatches.map((d) => (
                    <div className="history-row" key={d.id}>
                      <div className="history-icon">
                        <Truck size={18} />
                      </div>
                      <div>
                        <b>Dispatch #{d.id}</b>
                        <small>
                          {date(d.dispatchedAt)} · {d.lines.length} line
                          {d.lines.length === 1 ? "" : "s"}
                        </small>
                      </div>
                      {status(d.posting?.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <CustomerReturns
              saleId={data.id}
              items={data.items}
              role={user.role}
            />
            {dispatch && (
              <DispatchModal
                sale={data}
                close={() => setDispatch(false)}
                done={() => {
                  setDispatch(false);
                  load();
                }}
              />
            )}
            {updating && (
              <CommercialModal
                sale={data}
                close={() => setUpdating(false)}
                done={() => {
                  setUpdating(false);
                  load();
                }}
              />
            )}
          </>
        )
      )}
    </>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
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
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function DispatchModal({
  sale,
  close,
  done,
}: {
  sale: SaleDetail;
  close: () => void;
  done: () => void;
}) {
  const [qty, setQty] = useState<Record<number, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<{
      key: string;
      body: { lines: { fulfillmentId: number; quantityInOrderUnit: number }[] };
    } | null>(null);
  const lines = sale.items.flatMap((item) =>
    item.fulfillments.map((f) => ({
      item,
      f,
      dispatched: sale.dispatches
        .flatMap((d) => d.lines)
        .filter((line) => line.fulfillmentId === f.id)
        .reduce((sum, line) => sum + line.quantityInOrderUnit, 0),
    })),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = pending?.body || {
      lines: lines
        .filter(({ f }) => Number(qty[f.id]) > 0)
        .map(({ f }) => ({
          fulfillmentId: f.id,
          quantityInOrderUnit: Number(qty[f.id]),
        })),
    };
    if (!body.lines.length) {
      setError("Enter a quantity for at least one warehouse line.");
      return;
    }
    const attempt = pending || { key: newKey(), body };
    setPending(attempt);
    setBusy(true);
    setError("");
    try {
      await command(`/sale/${sale.id}/dispatches`, attempt.body, attempt.key);
      setPending(null);
      done();
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.status === 0
          ? "Network failed. Retry uses the same request and idempotency key."
          : err.message,
      );
      if (err.status !== 0) setPending(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Dispatch stock" close={close}>
      <form onSubmit={submit}>
        <p className="modal-intro">
          Confirm quantities leaving each warehouse. Stock is deducted only
          after the server confirms this dispatch.
        </p>
        {lines.map(({ item, f, dispatched }) => (
          <label key={f.id} className="dispatch-line">
            <span>
              <b>{item.product.name}</b>
              <small>
                {f.warehouse.name} · {f.quantityInOrderUnit} planned ·{" "}
                {dispatched} dispatched ·{" "}
                {Math.max(0, f.quantityInOrderUnit - dispatched)} remaining{" "}
                {item.unit.name}
              </small>
            </span>
            <input
              type="number"
              min="0"
              max={Math.max(0, f.quantityInOrderUnit - dispatched)}
              step="1"
              placeholder="0"
              value={qty[f.id] || ""}
              disabled={!!pending}
              onChange={(e) => setQty({ ...qty, [f.id]: e.target.value })}
              aria-label={`Dispatch ${item.product.name} from ${f.warehouse.name}`}
            />
          </label>
        ))}
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="subtle" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Confirming…"
              : pending
                ? "Retry same dispatch"
                : "Confirm dispatch"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CommercialModal({
  sale,
  close,
  done,
}: {
  sale: SaleDetail;
  close: () => void;
  done: () => void;
}) {
  const [transactionStatus, setStatus] = useState(sale.transactionStatus),
    [amountPaid, setPaid] = useState(sale.amountPaid),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(`/sale/${sale.id}`, {
        method: "PATCH",
        body: JSON.stringify({ transactionStatus, amountPaid }),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Update commercial status" close={close}>
      <form onSubmit={submit}>
        <p className="modal-intro">
          Payment and delivery are tracked separately by the server. A sale
          completes only when its backend rules are met.
        </p>
        <label>
          Status
          <AppSelect
            value={transactionStatus}
            onValueChange={(value) => setStatus(value)}
            options={[
              { value: "DRAFT", label: <>DRAFT</> },
              { value: "PENDING", label: <>PENDING</> },
              { value: "COMPLETED", label: <>COMPLETED</> },
              { value: "CANCELLED", label: <>CANCELLED</> },
            ]}
          />
        </label>
        <label>
          Amount paid (₦)
          <input
            value={amountPaid}
            onChange={(e) => setPaid(e.target.value)}
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,4})?"
            required
          />
        </label>
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
    </Modal>
  );
}
type Purchase = Entity & {
  supplier?: { name: string };
  transactionStatus: string;
  paymentStatus: string;
  receivingStatus: string;
  createdAt: string;
  totalPurchaseCost: string;
  extraCost?: string;
  amountPaid: string;
  items?: Array<{
    id: number;
    product: { name: string; baseUnit: string };
    unit: { name: string };
    quantityOrdered: number;
    quantityReceived: number;
    agreedUnitCost: string;
  }>;
  receipts?: Array<{
    id: number;
    status: string;
    receivedAt: string;
    items: Array<{
      purchaseItemId: number;
      quantityInOrderUnit: number;
      quantityBase: number;
      warehouse: { name: string };
    }>;
  }>;
};
function Purchases({ user }: { user: User }) {
  const [rows, setRows] = useState<Purchase[]>([]),
    [detail, setDetail] = useState<Purchase | null>(null),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(true),
    [receipt, setReceipt] = useState(false),
    [posting, setPosting] = useState<number | null>(null),
    [postKey, setPostKey] = useState(""),
    [postError, setPostError] = useState(""),
    [postBusy, setPostBusy] = useState(false),
    [creating, setCreating] = useState(
      () => user.role !== "AUDITOR" && !!readPurchaseAttempt(user.id),
    ),
    [commercial, setCommercial] = useState(false);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await request<ApiList<Purchase>>("/purchase/?limit=50");
      setRows(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  async function open(id: number): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const r = await request<{ data: Purchase }>(`/purchase/${id}`);
      setDetail(r.data);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function post() {
    if (!detail || posting === null || postBusy) return;
    const savedKey = `sb-purchase-post-v1:${user.id}:${detail.id}:${posting}`;
    const key = postKey || sessionStorage.getItem(savedKey) || newKey();
    try {
      sessionStorage.setItem(savedKey, key);
    } catch {
      setPostError(
        "Browser session storage is needed to safely retry this posting after a reload.",
      );
      return;
    }
    setPostKey(key);
    setPostError("");
    setPostBusy(true);
    try {
      await command(`/purchase/${detail.id}/receipts/${posting}/post`, {}, key);
      sessionStorage.removeItem(savedKey);
      setPosting(null);
      setPostKey("");
      open(Number(detail.id));
    } catch (e) {
      const err = e as ApiError;
      setPostError(err.message);
      if (err.status === 400 || err.status === 403) {
        sessionStorage.removeItem(savedKey);
        setPostKey("");
      }
    } finally {
      setPostBusy(false);
    }
  }
  if (creating)
    return (
      <PurchaseCreate
        userId={user.id}
        close={() => {
          setCreating(false);
          load();
        }}
        done={(id, receiveNow) => {
          setCreating(false);
          setReceipt(receiveNow);
          void open(id);
        }}
      />
    );
  return (
    <>
      {detail ? (
        <>
          <button
            className="back"
            onClick={() => {
              setDetail(null);
              load();
            }}
          >
            <ArrowLeft size={17} /> All purchases
          </button>
          <div className="page-head">
            <div>
              <div className="eyebrow">PURCHASE / #{detail.id}</div>
              <h1>Purchase #{detail.id}</h1>
              <p>
                {detail.supplier?.name || "Unassigned supplier"} ·{" "}
                {date(detail.createdAt)}
              </p>
            </div>
            <div className="head-actions">
              {user.role !== "AUDITOR" && (
                <button className="primary" onClick={() => setReceipt(true)}>
                  <Plus size={17} /> Draft receipt
                </button>
              )}
              {["ADMIN", "MANAGER"].includes(user.role) && (
                <button className="subtle" onClick={() => setCommercial(true)}>
                  Update commercial
                </button>
              )}
            </div>
          </div>
          <div className="summary-grid">
            <div className="summary">
              <span>Total cost</span>
              <strong className="money">
                {money(detail.totalPurchaseCost)}
              </strong>
            </div>
            <div className="summary">
              <span>Commercial</span>
              <strong className="status-large">
                {detail.transactionStatus}
              </strong>
              <small>{detail.paymentStatus}</small>
            </div>
            <div className="summary">
              <span>Receiving</span>
              <strong className="status-large">
                {detail.receivingStatus?.replaceAll("_", " ")}
              </strong>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h2>Order lines</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Unit</th>
                    <th className="right">Ordered</th>
                    <th className="right">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items?.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <b>{i.product.name}</b>
                      </td>
                      <td>{i.unit.name}</td>
                      <td className="right">{i.quantityOrdered}</td>
                      <td className="right">{i.quantityReceived}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Goods receipts</h2>
                <p>
                  A draft does not increase stock. Posting confirms stock
                  received.
                </p>
              </div>
            </div>
            {detail.receipts?.length ? (
              <div className="history">
                {detail.receipts.map((r) => (
                  <div className="history-row purchase-history-row" key={r.id}>
                    <div className="history-icon">
                      <PackageCheck size={18} />
                    </div>
                    <div>
                      <b>Receipt #{r.id}</b>
                      <small>
                        {date(r.receivedAt)} · {r.items.length} line
                        {r.items.length === 1 ? "" : "s"}
                      </small>
                    </div>
                    {status(r.status)}
                    {r.status === "DRAFT" && user.role !== "AUDITOR" && (
                      <button
                        className="subtle"
                        onClick={() => {
                          setPosting(r.id);
                          setPostKey("");
                        }}
                      >
                        Post receipt
                      </button>
                    )}
                    <div className="purchase-history-lines">
                      {r.items.map((item, index) => {
                        const ordered = detail.items?.find(
                          (line) => line.id === item.purchaseItemId,
                        );
                        return (
                          <div key={`${item.purchaseItemId}-${index}`}>
                            <b>
                              {ordered?.product.name ||
                                `Order line #${item.purchaseItemId}`}
                            </b>
                            <span>
                              {item.quantityInOrderUnit}{" "}
                              {ordered?.unit.name || "units"}
                              {" · "}
                              {item.quantityBase}{" "}
                              {ordered?.product.baseUnit || "base units"}
                              {" · "}
                              {item.warehouse.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-inline">No goods receipts yet.</div>
            )}
          </div>
          <SupplierReturns purchaseId={Number(detail.id)} role={user.role} />
          {commercial && (
            <PurchaseCommercial
              purchase={detail}
              close={() => setCommercial(false)}
              done={() => {
                setCommercial(false);
                open(Number(detail.id));
              }}
            />
          )}
          {receipt && (
            <ReceiptModal
              purchase={detail}
              userId={user.id}
              close={() => setReceipt(false)}
              done={(receiptId) => {
                setReceipt(false);
                void open(Number(detail.id)).then((loaded) => {
                  if (loaded) setPosting(receiptId);
                });
              }}
            />
          )}
          {posting !== null && (
            <Modal
              title={`Post receipt #${posting}`}
              close={() => setPosting(null)}
            >
              <p className="modal-intro">
                Posting this receipt increases stock. Confirm the received
                quantities and warehouse are correct.
              </p>
              {detail.receipts
                ?.find((item) => item.id === posting)
                ?.items.map((item, index) => {
                  const ordered = detail.items?.find(
                    (line) => line.id === item.purchaseItemId,
                  );
                  return (
                    <div
                      className="sale-info-row"
                      key={`${item.purchaseItemId}-${index}`}
                    >
                      <span>
                        {ordered?.product.name ||
                          `Order line #${item.purchaseItemId}`}
                      </span>
                      <b>
                        {item.quantityInOrderUnit}{" "}
                        {ordered?.unit.name || "units"} · {item.warehouse.name}
                      </b>
                    </div>
                  );
                })}
              {postError && <div className="alert error">{postError}</div>}
              <div className="modal-actions">
                <button className="subtle" onClick={() => setPosting(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={postBusy} onClick={post}>
                  {postBusy
                    ? "Posting…"
                    : postKey
                      ? "Retry same posting"
                      : "Confirm posting"}
                </button>
              </div>
            </Modal>
          )}
        </>
      ) : (
        <>
          <div className="page-head">
            <div>
              <div className="eyebrow">COMMERCIAL / PURCHASING</div>
              <h1>Purchases</h1>
              <p>Commercial orders and their separate goods receipts.</p>
            </div>
            {user.role !== "AUDITOR" && (
              <button className="primary" onClick={() => setCreating(true)}>
                <Plus size={17} /> New purchase
              </button>
            )}
          </div>
          <div className="panel">
            <div className="panel-head">
              <h2>Purchase orders</h2>
              <button className="subtle" onClick={load}>
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
            {loading ? (
              <div className="state">Loading purchases…</div>
            ) : error ? (
              stateMessage(error, load)
            ) : rows.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Purchase</th>
                      <th>Supplier</th>
                      <th>Created</th>
                      <th>Commercial</th>
                      <th>Receiving</th>
                      <th className="right">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        tabIndex={0}
                        onClick={() => open(Number(r.id))}
                        onKeyDown={(e) =>
                          e.key === "Enter" && open(Number(r.id))
                        }
                      >
                        <td>
                          <b>#{r.id}</b>
                        </td>
                        <td>{r.supplier?.name || "—"}</td>
                        <td>{date(r.createdAt)}</td>
                        <td>{status(r.transactionStatus)}</td>
                        <td>{status(r.receivingStatus)}</td>
                        <td className="right amount">
                          {money(r.totalPurchaseCost)}
                        </td>
                        <td>
                          <ChevronRight size={17} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="state">No purchases found.</div>
            )}
          </div>
        </>
      )}
    </>
  );
}
function PurchaseCommercial({
  purchase,
  close,
  done,
}: {
  purchase: Purchase;
  close: () => void;
  done: () => void;
}) {
  const [transactionStatus, setStatus] = useState(purchase.transactionStatus),
    [amountPaid, setPaid] = useState(purchase.amountPaid),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const due = decimal(purchase.totalPurchaseCost);
  const extra = decimal(purchase.extraCost ?? "0");
  const paidValue = decimal(amountPaid);
  const fullyPaid =
    purchase.transactionStatus !== "CANCELLED" &&
    due !== null &&
    extra !== null &&
    paidValue !== null &&
    paidValue >= due + extra;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(`/purchase/${purchase.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          transactionStatus: fullyPaid ? "COMPLETED" : transactionStatus,
          amountPaid,
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
    <Modal title="Update purchase commercial status" close={close}>
      <form onSubmit={submit}>
        <p className="modal-intro">
          Paying in full selects COMPLETED for the commercial status. Receiving
          remains separate and changes only when a receipt is posted.
        </p>
        <label>
          Status
          <AppSelect
            value={fullyPaid ? "COMPLETED" : transactionStatus}
            onValueChange={(value) => setStatus(value)}
            disabled={fullyPaid}
            options={[
              { value: "DRAFT", label: <>DRAFT</> },
              { value: "PENDING", label: <>PENDING</> },
              { value: "COMPLETED", label: <>COMPLETED</> },
              { value: "CANCELLED", label: <>CANCELLED</> },
            ]}
          />
        </label>
        <label>
          Amount paid (₦)
          <input
            value={amountPaid}
            onChange={(e) => {
              setPaid(e.target.value);
              if (
                transactionStatus === "COMPLETED" &&
                decimal(e.target.value) !== null &&
                due !== null &&
                extra !== null &&
                decimal(e.target.value)! < due + extra
              )
                setStatus("PENDING");
            }}
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,4})?"
            required
          />
        </label>
        <p className="sale-help">
          Amount paid is the cumulative total. This updates a status; it does
          not record a separate payment transaction.
        </p>
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
    </Modal>
  );
}
function Inventory({ user }: { user: User }) {
  const [tab, setTab] = useState<
      "availability" | "low-stock" | "expiring-soon"
    >("low-stock"),
    [data, setData] = useState<any[]>([]),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(true),
    [products, setProducts] = useState<Entity[]>([]),
    [productId, setProductId] = useState(""),
    [units, setUnits] = useState<Entity[]>([]),
    [unitId, setUnitId] = useState(""),
    [availability, setAvailability] = useState<any>(null),
    [adjusting, setAdjusting] = useState(false);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (tab === "availability") {
        setLoading(false);
        return;
      }
      const r = await request<any>(`/inventory/${tab}?limit=50`);
      setData(r.data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [tab]);
  useEffect(() => {
    request<ApiList<Entity>>("/catalog/products?limit=100")
      .then((r) => setProducts(r.data))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (productId)
      request<ApiList<Entity>>(`/catalog/products/${productId}/units?limit=100`)
        .then((r) => setUnits(r.data))
        .catch(() => {});
  }, [productId]);
  async function check() {
    setLoading(true);
    setError(null);
    try {
      const r = await request<{ data: any }>(
        `/inventory/availability?productId=${productId}&unitId=${unitId}`,
      );
      setAvailability(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">WAREHOUSE / INVENTORY</div>
          <h1>Inventory</h1>
          <p>Live availability, low stock and upcoming expiry.</p>
        </div>
        {["ADMIN", "MANAGER"].includes(user.role) && (
          <button className="primary" onClick={() => setAdjusting(true)}>
            <Plus size={17} /> Physical adjustment
          </button>
        )}
      </div>
      <div className="tabs">
        {(["availability", "low-stock", "expiring-soon"] as const).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t.replaceAll("-", " ")}
          </button>
        ))}
      </div>
      <div className="panel">
        {tab === "availability" ? (
          <>
            <div className="panel-head">
              <div>
                <h2>Check availability</h2>
                <p>
                  Informational snapshot; stock is checked again at dispatch.
                </p>
              </div>
            </div>
            <div className="filters">
              <AppSelect
                value={productId}
                onValueChange={(value) => {
                  setProductId(value);
                  setUnitId("");
                  setAvailability(null);
                }}
                aria-label="Product"
                options={[
                  { value: "", label: <>Choose product</> },
                  ...products.map((p) => ({
                    value: String(p.id),
                    label: <>{p.name}</>,
                  })),
                ]}
              />
              <AppSelect
                value={unitId}
                onValueChange={(value) => {
                  setUnitId(value);
                  setAvailability(null);
                }}
                aria-label="Product unit"
                options={[
                  { value: "", label: <>Choose unit</> },
                  ...units.map((u) => ({
                    value: String(u.id),
                    label: <>{u.name}</>,
                  })),
                ]}
              />
              <button
                className="primary"
                disabled={!productId || !unitId}
                onClick={check}
              >
                Check stock
              </button>
            </div>
            {loading ? (
              <div className="state">Loading…</div>
            ) : error ? (
              stateMessage(error, check)
            ) : (
              availability && (
                <div className="availability">
                  <div className="availability-note">
                    Previewed {date(availability.previewedAt)} · Informational
                    only. Recheck at dispatch.
                  </div>
                  {availability.warehouses?.length ? (
                    availability.warehouses.map((w: any) => (
                      <div className="availability-row" key={w.warehouseId}>
                        <div>
                          <b>{w.warehouseName}</b>
                          <small>
                            {w.warehouseLocation || "Warehouse"} ·{" "}
                            {w.inventoryComposition?.replaceAll("_", " ")}
                          </small>
                        </div>
                        <div>
                          <strong>{w.availableQuantityInRequestedUnit}</strong>
                          <small>selected units</small>
                        </div>
                        <div>
                          <strong>{w.sellableQuantityBase}</strong>
                          <small>base units</small>
                        </div>
                        <div>
                          <small>Earliest expiry</small>
                          <b>{w.earliestEligibleExpiryDate || "—"}</b>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-inline">
                      No sellable stock currently available.
                    </div>
                  )}
                </div>
              )
            )}
          </>
        ) : (
          <>
            <div className="panel-head">
              <h2>
                {tab === "low-stock" ? "Low stock alerts" : "Expiring soon"}
              </h2>
              <button className="subtle" onClick={load}>
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
            {loading ? (
              <div className="state">Loading alerts…</div>
            ) : error ? (
              stateMessage(error, load)
            ) : data.length ? (
              <div className="alert-list">
                {data.map((r, i) => (
                  <div
                    className="alert-row"
                    key={r.batchId || r.productId || i}
                  >
                    <div className="alert-icon">
                      {tab === "low-stock" ? "!" : "◷"}
                    </div>
                    <div>
                      <b>
                        {r.product?.name || r.productName || `Alert ${i + 1}`}
                      </b>
                      <small>
                        {r.warehouse?.name || r.warehouseName || ""}{" "}
                        {r.expiryDate ? ` · Expires ${date(r.expiryDate)}` : ""}
                      </small>
                    </div>
                    <strong>
                      {r.sellableQuantityBase ?? r.quantityOnHandBase ?? ""}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="state">
                <Package size={26} />
                <h3>No alerts</h3>
                <p>Nothing to review in this view.</p>
              </div>
            )}
          </>
        )}
      </div>
      {adjusting && (
        <AdjustmentModal
          close={() => setAdjusting(false)}
          done={() => {
            setAdjusting(false);
            load();
          }}
        />
      )}
    </>
  );
}
function AdjustmentModal({
  close,
  done,
}: {
  close: () => void;
  done: () => void;
}) {
  const [batchId, setBatch] = useState(""),
    [count, setCount] = useState(""),
    [reason, setReason] = useState("PHYSICAL_COUNT"),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{ key: string; body: unknown } | null>(
      null,
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const body = pending?.body || {
      batchId,
      countedQuantityBase: Number(count),
      reason,
      ...(notes ? { notes } : {}),
    };
    const attempt = pending || { key: newKey(), body };
    setPending(attempt);
    setError("");
    setBusy(true);
    try {
      await command("/inventory/adjustments", attempt.body, attempt.key);
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
    <Modal title="Physical stock adjustment" close={close}>
      <form onSubmit={submit}>
        <p className="modal-intro">
          Enter the inventory batch ID and counted quantity in the product’s
          base unit.
        </p>
        <label>
          Batch ID
          <input
            required
            value={batchId}
            onChange={(e) => setBatch(e.target.value)}
            disabled={!!pending}
          />
        </label>
        <label>
          Counted base-unit quantity
          <input
            type="number"
            required
            min="0"
            step="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            disabled={!!pending}
          />
        </label>
        <label>
          Reason
          <AppSelect
            value={reason}
            onValueChange={(value) => setReason(value)}
            disabled={!!pending}
            options={[
              { value: "PHYSICAL_COUNT", label: <>PHYSICAL_COUNT</> },
              { value: "LOSS", label: <>LOSS</> },
              { value: "FOUND_STOCK", label: <>FOUND_STOCK</> },
              { value: "DATA_CORRECTION", label: <>DATA_CORRECTION</> },
            ]}
          />
        </label>
        <label>
          Notes
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!!pending}
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="subtle" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Confirming…"
              : pending
                ? "Retry same adjustment"
                : "Confirm adjustment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Directory({ page, user }: { page: Page; user: User }) {
  const paths: Partial<Record<Page, string>> = {
    Contacts: "/contacts/",
    Categories: "/catalog/categories",
    Products: "/catalog/products",
    Warehouses: "/warehouses/",
  };
  const path = paths[page];
  const [rows, setRows] = useState<Entity[]>([]),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(true),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<Entity | null>(null),
    [child, setChild] = useState<Entity[]>([]),
    [unitCreating, setUnitCreating] = useState(false),
    [editing, setEditing] = useState(false),
    [unitEditing, setUnitEditing] = useState<Entity | null>(null);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (!path) {
        setRows([]);
        return;
      }
      const r = await request<ApiList<Entity>>(
        `${path}${path.includes("?") ? "&" : "?"}limit=100`,
      );
      setRows(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setSelected(null);
    load();
  }, [page]);
  useEffect(() => {
    if (selected && page === "Products")
      request<ApiList<Entity>>(
        `/catalog/products/${selected.id}/units?limit=100`,
      )
        .then((r) => setChild(r.data))
        .catch((e) => setError(e));
  }, [selected]);
  if (!path)
    return (
      <>
        <div className="page-head">
          <div>
            <div className="eyebrow">RETURNS</div>
            <h1>{page}</h1>
            <p>Return history is available inside its source order.</p>
          </div>
        </div>
        <div className="panel">
          <div className="state">
            <RotateCcw size={28} />
            <h3>
              Open a {page === "Customer returns" ? "sale" : "purchase"} to
              review returns
            </h3>
            <p>
              The backend lists returns within each order. There is no verified
              global returns list endpoint.
            </p>
          </div>
        </div>
      </>
    );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">MASTER DATA</div>
          <h1>{page}</h1>
          <p>Current records from the inventory service.</p>
        </div>
        {["ADMIN", "MANAGER"].includes(user.role) && (
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={17} /> New {page.slice(0, -1).toLowerCase()}
          </button>
        )}
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>{page}</h2>
          <button className="subtle" onClick={load}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        {loading ? (
          <div className="state">Loading {page.toLowerCase()}…</div>
        ) : error ? (
          stateMessage(error, load)
        ) : rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  {page === "Contacts" && <th>Type</th>}
                  {page === "Warehouses" && <th>Location</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(r)}
                  >
                    <td>
                      <b>{r.name}</b>
                    </td>
                    <td className="muted">{String(r.id).slice(0, 12)}…</td>
                    {page === "Contacts" && (
                      <td>
                        {r.isSupplier ? "Supplier " : ""}
                        {r.isBuyer ? "Buyer" : ""}
                      </td>
                    )}
                    {page === "Warehouses" && <td>{r.location || "—"}</td>}
                    <td>
                      <ChevronRight size={17} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="state">
            <h3>No {page.toLowerCase()} yet</h3>
          </div>
        )}
      </div>
      {selected && (
        <Modal title={selected.name || page} close={() => setSelected(null)}>
          <div className="detail-pairs">
            {Object.entries(selected)
              .filter(([k, v]) => typeof v !== "object")
              .map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{String(v ?? "—")}</b>
                </div>
              ))}
          </div>
          {["ADMIN", "MANAGER"].includes(user.role) && (
            <button className="subtle" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {page === "Products" && (
            <>
              <h3>Product units</h3>
              {["ADMIN", "MANAGER"].includes(user.role) && (
                <button
                  className="subtle"
                  onClick={() => setUnitCreating(true)}
                >
                  Add ProductUnit
                </button>
              )}
              {child.map((u) => (
                <div className="history-row" key={u.id}>
                  <b>{u.name}</b>
                  <span>{u.sku}</span>
                  <span>×{u.multiplier}</span>
                  <span>{money(u.price)}</span>
                  {["ADMIN", "MANAGER"].includes(user.role) && (
                    <button
                      className="subtle"
                      onClick={() => setUnitEditing(u)}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </Modal>
      )}
      {selected && unitCreating && (
        <UnitCreate
          productId={String(selected.id)}
          close={() => setUnitCreating(false)}
          done={() => {
            setUnitCreating(false);
            request<ApiList<Entity>>(
              `/catalog/products/${selected.id}/units`,
            ).then((r) => setChild(r.data));
          }}
        />
      )}
      {selected && unitEditing && (
        <EditRecord
          path={`/catalog/products/${selected.id}/units/${unitEditing.id}`}
          record={unitEditing}
          fields={["name", "sku", "price"]}
          close={() => setUnitEditing(null)}
          done={() => {
            setUnitEditing(null);
            request<ApiList<Entity>>(
              `/catalog/products/${selected.id}/units`,
            ).then((r) => setChild(r.data));
          }}
        />
      )}
      {selected && editing && (
        <EditRecord
          path={`${path.replace(/\/$/, "")}/${selected.id}`}
          record={selected}
          fields={
            page === "Products"
              ? ["name", "reorderPoint"]
              : page === "Contacts"
                ? ["name", "isSupplier", "isBuyer"]
                : page === "Warehouses"
                  ? ["name", "location"]
                  : ["name"]
          }
          close={() => setEditing(false)}
          done={() => {
            setEditing(false);
            setSelected(null);
            load();
          }}
        />
      )}
      {creating &&
        (page === "Products" ? (
          <ProductCreate
            close={() => setCreating(false)}
            done={() => {
              setCreating(false);
              load();
            }}
          />
        ) : (
          <DirectoryCreate
            page={page}
            path={path}
            close={() => setCreating(false)}
            done={() => {
              setCreating(false);
              load();
            }}
          />
        ))}
    </>
  );
}
function DirectoryCreate({
  page,
  path,
  close,
  done,
}: {
  page: Page;
  path: string;
  close: () => void;
  done: () => void;
}) {
  const [name, setName] = useState(""),
    [location, setLocation] = useState(""),
    [supplier, setSupplier] = useState(false),
    [buyer, setBuyer] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body =
      page === "Contacts"
        ? { name, isSupplier: supplier, isBuyer: buyer }
        : page === "Warehouses"
          ? { name, location: location || null }
          : { name };
    try {
      await request(path, { method: "POST", body: JSON.stringify(body) });
      done();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={`New ${page.slice(0, -1).toLowerCase()}`} close={close}>
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
        {page === "Warehouses" && (
          <label>
            Location
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        )}
        {page === "Contacts" && (
          <div className="checks">
            <label>
              <input
                type="checkbox"
                checked={supplier}
                onChange={(e) => setSupplier(e.target.checked)}
              />{" "}
              Supplier
            </label>
            <label>
              <input
                type="checkbox"
                checked={buyer}
                onChange={(e) => setBuyer(e.target.checked)}
              />{" "}
              Buyer
            </label>
          </div>
        )}
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button className="subtle" type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
