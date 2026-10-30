import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cachedRequest, refreshRequest } from "./query";
import { ApiError, command, date, newKey, request, type Role } from "./api";
type Return = {
  id: number;
  status: string;
  reason: string;
  createdAt: string;
  quantitySummary?: Array<{
    productId: string;
    quantityInOrderUnit: number;
    quantityBase: number;
  }>;
};
export function SupplierReturns({
  purchaseId,
  role,
}: {
  purchaseId: number;
  role: Role;
}) {
  const [rows, setRows] = useState<Return[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [posting, setPosting] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState("");
  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      const r = await (force ? refreshRequest : cachedRequest)<{
        data: { returns: Return[] };
      }>(`/purchase/${purchaseId}/returns`);
      setRows(r.data.returns);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [purchaseId]);
  async function post() {
    if (posting === null || busy) return;
    const requestKey = key || newKey();
    setKey(requestKey);
    setError("");
    setBusy(true);
    try {
      await command(
        `/purchase/${purchaseId}/returns/${posting}/post`,
        {},
        requestKey,
      );
      setPosting(null);
      setKey("");
      load();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.status !== 0) setKey("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Supplier returns</h2>
          <p>Posted returns deduct stock from a specific receipt batch.</p>
        </div>
      </div>
      {loading ? (
        <div className="empty-inline">Loading returns…</div>
      ) : error ? (
        <div className="empty-inline">
          {error}{" "}
          <button className="subtle" onClick={() => load(true)}>
            Retry
          </button>
        </div>
      ) : rows.length ? (
        <div className="history">
          {rows.map((r) => (
            <div className="history-row" key={r.id}>
              <div>
                <b>Return #{r.id}</b>
                <small>
                  {r.reason} · {date(r.createdAt)}
                </small>
              </div>
              <span className="badge neutral">{r.status}</span>
              {["ADMIN", "MANAGER"].includes(role) && r.status === "DRAFT" && (
                <button className="subtle" onClick={() => setPosting(r.id)}>
                  Post return
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-inline">
          No supplier returns for this purchase.
        </div>
      )}
      {posting !== null && (
        <div className="modal-back">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Post supplier return"
          >
            <div className="modal-head">
              <h2>Post supplier return #{posting}</h2>
              <button
                className="icon"
                onClick={() => setPosting(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="modal-intro">
              This deducts stock from the return’s selected receipt batch.
            </p>
            {error && <div className="alert error">{error}</div>}
            <div className="modal-actions">
              <button className="subtle" onClick={() => setPosting(null)}>
                Cancel
              </button>
              <button className="primary" disabled={busy} onClick={post}>
                {busy
                  ? "Posting…"
                  : key
                    ? "Retry same posting"
                    : "Confirm posting"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
