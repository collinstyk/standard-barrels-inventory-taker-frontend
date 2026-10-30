import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ApiError, request } from "../api";

export type TransactionContact = { id: string; name: string };

export function TransactionContactCreate({
  kind,
  close,
  created,
}: {
  kind: "BUYER" | "SUPPLIER";
  close: () => void;
  created: (contact: TransactionContact) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const running = useRef(false);
  const label = kind === "BUYER" ? "buyer" : "supplier";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (running.current || uncertain) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await request<{ data: TransactionContact }>(
        "/contacts/",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            isBuyer: kind === "BUYER",
            isSupplier: kind === "SUPPLIER",
          }),
        },
      );
      if (!response.data?.id || !response.data?.name) {
        setUncertain(true);
        throw new Error(
          "The contact may have been saved, but the server did not return its details. Close this window and refresh the contact list before trying again.",
        );
      }
      created(response.data);
    } catch (cause) {
      const failure = cause as ApiError;
      if (failure.status === 0) {
        setUncertain(true);
        setError(
          "The connection failed after submission. This contact may already exist. Close this window and refresh the contact list before trying again.",
        );
      } else {
        setError(failure.message || "Could not save the contact.");
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-back">
      <div
        className="modal transaction-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-contact-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) close();
        }}
      >
        <div className="modal-head">
          <h2 id="transaction-contact-title">New {label}</h2>
          <button
            type="button"
            className="icon"
            aria-label="Close contact form"
            onClick={close}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit}>
          <p className="modal-intro">
            Save the {label} now, then continue reviewing this transaction. Your
            product lines and quantities will stay in place.
          </p>
          <label>
            {kind === "BUYER" ? "Buyer" : "Supplier"} name
            <input
              autoFocus
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy || uncertain}
            />
          </label>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="subtle"
              onClick={close}
              disabled={busy}
            >
              {uncertain ? "Close and refresh" : "Cancel"}
            </button>
            <button className="primary" disabled={busy || uncertain}>
              {busy ? "Saving…" : `Save ${label}`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
