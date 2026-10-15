export type Role = "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR";
export type User = { id: string; name: string; email: string; role: Role };
type SavedSession = { token: string; user: User; expiresAt: number };
const STORAGE_KEY = "sb-session-v1";
const listeners = new Set<() => void>();

// Decoding only rejects expired/corrupt data. The backend still verifies the JWT.
function parseSession(value: unknown): SavedSession | null {
  if (!value || typeof value !== "object") return null;
  const { token, user } = value as Partial<SavedSession>;
  if (
    typeof token !== "string" ||
    !user ||
    typeof user.id !== "string" ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" ||
    !["ADMIN", "MANAGER", "STAFF", "AUDITOR"].includes(user.role)
  )
    return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")),
    );
    if (
      payload.id !== user.id ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp)
    )
      return null;
    const expiresAt = payload.exp * 1000;
    return expiresAt > Date.now() ? { token, user, expiresAt } : null;
  } catch {
    return null;
  }
}

function readSavedSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const saved = raw ? parseSession(JSON.parse(raw)) : null;
    if (!saved) sessionStorage.removeItem(STORAGE_KEY);
    return saved;
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Storage may be unavailable. */
    }
    return null;
  }
}

let current = readSavedSession();
export const session = {
  get() {
    if (current && current.expiresAt <= Date.now()) session.set(null);
    return current?.token ?? null;
  },
  user() {
    return session.get() ? current!.user : null;
  },
  set(token: string | null, user?: User) {
    const next = token ? parseSession({ token, user }) : null;
    if (token && !next)
      throw new Error(
        "The server returned an invalid or expired session. Please sign in again.",
      );
    current = next;
    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Retain memory-only login if browser storage is blocked. */
    }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
