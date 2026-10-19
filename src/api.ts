import { session } from "./session";
export { session } from "./session";
export type { Role, User } from "./session";

export type ApiList<T> = {
  status: string;
  data: T[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const writeListeners = new Set<() => void>();
export function subscribeToWrites(listener: () => void) {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = session.get();
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Network unavailable. Check the server and retry.");
  }
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (response.status === 401 && token && session.get() === token)
    session.set(null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload.message ||
        payload.error ||
        `Request failed (${response.status}).`,
    );
  if (options.method && options.method.toUpperCase() !== "GET")
    writeListeners.forEach((listener) => listener());
  return payload as T;
}

export function command<T>(
  path: string,
  payload: unknown,
  key: string,
  method = "POST",
) {
  return request<T>(path, {
    method,
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
}

export function newKey() {
  return crypto.randomUUID();
}

export function money(value: string | number | null | undefined) {
  if (value == null) return "—";
  const raw = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return "—";
  const [whole, fraction = ""] = raw.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const minor = (BigInt(whole) * scale + BigInt(fraction || "0")) * 100n;
  const cents = (minor + scale / 2n) / scale;
  const major = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${major}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function date(value: string | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";
}

export type SaleList = {
  id: number;
  buyer: { id: string; name: string } | null;
  seller: { name: string };
  transactionStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: string;
  totalSaleAmount: string;
  amountPaid: string;
  itemCount: number;
  fulfilmentCount: number;
};

export type SaleDetail = SaleList & {
  items: Array<{
    id: number;
    product: { id: string; name: string; baseUnit: string };
    unit: { id: number; name: string; sku: string };
    quantityOrdered: number;
    quantityDelivered: number;
    confirmedUnitSalePrice: string;
    lineTotal: string;
    fulfillments: Array<{
      id: number;
      warehouse: { id: number; name: string };
      quantityInOrderUnit: number;
      quantityBase: number;
    }>;
  }>;
  dispatches: Array<{
    id: number;
    dispatchedAt: string;
    lines: Array<{
      fulfillmentId: number;
      quantityInOrderUnit: number;
      quantityBase: number;
    }>;
    posting: { status: string } | null;
  }>;
  customerReturns: Array<{ id: number; status: string }>;
};
