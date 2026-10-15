import { AppSelect } from "./components/AppSelect";
import React, { useEffect, useState } from "react";
import { request, session, type Role, type User } from "./api";

export function InviteStaff() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"STAFF" | "MANAGER" | "AUDITOR">("STAFF");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setLink("");
    try {
      const result = await request<{
        data: {
          token: string;
          invitation: { email: string; expiresAt: string };
        };
      }>("/auth/invitations", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setLink(
        `${window.location.origin}/#invite=${encodeURIComponent(result.data.token)}`,
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" style={{ maxWidth: 650, padding: 24 }}>
      <h1>Invite a team member</h1>
      <p>
        Create a single-use invitation for a specific email. It expires after 48
        hours. Share the link privately with that person.
      </p>
      <form onSubmit={submit}>
        <label>
          Email address
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        
        <label>
          Role
          <AppSelect
            value={role}
            onValueChange={(value) => setRole(value as typeof role)}
            options={[
              { value: "STAFF", label: <>Staff</> },
              { value: "MANAGER", label: <>Manager</> },
              { value: "AUDITOR", label: <>Auditor</> },
            ]}
          />
        </label>

        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : "Create invitation"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {link && (
        <div>
          <p>Copy this link now. It is shown only once:</p>
          <input readOnly value={link} aria-label="Invitation link" />
          <button onClick={() => navigator.clipboard.writeText(link)}>
            Copy link
          </button>
        </div>
      )}
    </section>
  );
}

export function AcceptInvite({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted: (user: User) => void;
}) {
  const [details, setDetails] = useState<{
    email: string;
    role: Role;
    expiresAt: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ data: typeof details }>("/auth/invitations/inspect", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((result) => setDetails(result.data))
      .catch((err) => setError(err.message));
  }, [token]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<{ token: string; data: { user: User } }>(
        "/auth/invitations/accept",
        {
          method: "POST",
          body: JSON.stringify({ token, name, password }),
        },
      );
      session.set(result.token);
      window.history.replaceState(null, "", "/");
      onAccepted(result.data.user);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Join Standard Barrels</h1>
        {details && (
          <p>
            Invitation for {details.email} as {details.role}. Expires{" "}
            {new Date(details.expiresAt).toLocaleString()}.
          </p>
        )}
        {details && (
          <form onSubmit={submit}>
            <label>
              Your name
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Create password
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <p>
              Use uppercase and lowercase letters, a number, and a symbol. No
              spaces.
            </p>
            <button className="primary full" disabled={busy}>
              {busy ? "Creating account…" : "Accept invitation"}
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        <a href="/">Sign in instead</a>
      </div>
    </div>
  );
}
