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

export function listData<T>(payload: ApiList<T>, path: string): T[] {
  if (Array.isArray(payload?.data)) return payload.data;
  throw new ApiError(
    502,
    `The server returned an unexpected list response for ${path}. Please retry or contact an administrator.`,
  );
}

function responseMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    for (const candidate of [body.message, body.error]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
      if (candidate && typeof candidate === "object") {
        const nested = (candidate as Record<string, unknown>).message;
        if (typeof nested === "string" && nested.trim()) return nested;
      }
    }
  }
  if (status === 404) return "The API endpoint was not found. Check the deployment configuration.";
  if (status === 502 || status === 503 || status === 504)
    return "The server is temporarily unavailable. Please retry shortly.";
  return `Request failed (${status}). Please retry.`;
}

const writeListeners = new Set<() => void>();
export function subscribeToWrites(listener: () => void) {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function apiUrl(path: string): string {
  const queryStart = path.indexOf("?");
  const route = queryStart < 0 ? path : path.slice(0, queryStart);
  const query = queryStart < 0 ? "" : path.slice(queryStart);
  return `/api/v1${route.replace(/\/+$/, "")}${query}`;
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
    response = await fetch(apiUrl(path), {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Network unavailable. Check the server and retry.");
  }
  let payload: unknown;
  let parsedJson = false;
  try {
    payload = await response.json();
    parsedJson = true;
  } catch {
    payload = null;
  }
  if (response.status === 401 && token && session.get() === token)
    session.set(null);
  if (!response.ok)
    throw new ApiError(response.status, responseMessage(payload, response.status));
  if (!parsedJson || payload === null || typeof payload !== "object")
    throw new ApiError(
      502,
      `The API returned an empty or non-JSON response for ${path}. Please retry.`,
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
