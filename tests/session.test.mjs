import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { afterEach, beforeEach } from "node:test";
import ts from "typescript";

const user = {
  id: "test-user",
  name: "Test Staff",
  email: "staff@example.test",
  role: "STAFF",
};
const token = (exp = Math.floor(Date.now() / 1000) + 3600, id = user.id) =>
  `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ id, exp })).toString("base64url")}.test-signature`;
let counter = 0;
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);
beforeEach(() => {
  const values = new Map();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage)
    Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else delete globalThis.sessionStorage;
});
async function load() {
  const sessionSource = await readFile(
    new URL("../src/session.ts", import.meta.url),
    "utf8",
  );
  const compile = (source) =>
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(compile(sessionSource)).toString("base64")}#${counter++}`;
  const { session } = await import(url);
  const apiSource = (
    await readFile(new URL("../src/api.ts", import.meta.url), "utf8")
  ).replaceAll('"./session"', JSON.stringify(url));
  const api = await import(
    `data:text/javascript;base64,${Buffer.from(compile(apiSource)).toString("base64")}#${counter++}`
  );
  return { session, ...api };
}

test("a saved tab session survives a fresh module load; logout removes it", async () => {
  const first = await load();
  const jwt = token();
  first.session.set(jwt, user);
  const reloaded = await load();
  assert.equal(reloaded.session.get(), jwt);
  assert.deepEqual(reloaded.session.user(), user);
  reloaded.session.set(null);
  assert.equal((await load()).session.get(), null);
});
test("expired, corrupt and mismatched sessions are removed", async () => {
  for (const value of [
    "invalid json",
    JSON.stringify({ token: token(1), user }),
    JSON.stringify({ token: token(undefined, "someone-else"), user }),
  ]) {
    sessionStorage.setItem("sb-session-v1", value);
    assert.equal((await load()).session.get(), null);
    assert.equal(sessionStorage.getItem("sb-session-v1"), null);
  }
});
test("authenticated 401 clears saved login and notifies the app", async () => {
  const { session, request } = await load();
  session.set(token(), user);
  let notified = false;
  const unsubscribe = session.subscribe(() => {
    notified = true;
  });
  globalThis.fetch = async (_url, options) => {
    assert.match(options.headers.get("Authorization"), /^Bearer /);
    assert.equal(options.cache, "no-store");
    return Response.json({ message: "Session expired" }, { status: 401 });
  };
  await assert.rejects(request("/sale/?limit=1"), { status: 401 });
  assert.equal(session.get(), null);
  assert.equal(sessionStorage.getItem("sb-session-v1"), null);
  assert.equal(notified, true);
  unsubscribe();
});
test("network failures and 403 preserve the session", async () => {
  const { session, request } = await load();
  const jwt = token();
  session.set(jwt, user);
  globalThis.fetch = async () => {
    throw Error("offline");
  };
  await assert.rejects(request("/sale/?limit=1"), { status: 0 });
  assert.equal(session.get(), jwt);
  globalThis.fetch = async () =>
    Response.json({ message: "Denied" }, { status: 403 });
  await assert.rejects(request("/contacts/"), { status: 403 });
  assert.equal(session.get(), jwt);
});
test("a late 401 for an old login cannot clear a newer session", async () => {
  const { session, request } = await load();
  session.set(token(), user);
  let finish;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = request("/sale/?limit=1");
  const next = token(Math.floor(Date.now() / 1000) + 7200);
  session.set(next, user);
  finish(Response.json({ message: "Old session rejected" }, { status: 401 }));
  await assert.rejects(pending, { status: 401 });
  assert.equal(session.get(), next);
});
test("blocked storage does not prevent a memory-only login", async () => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw Error("blocked");
    },
  });
  const { session } = await load();
  const jwt = token();
  session.set(jwt, user);
  assert.equal(session.get(), jwt);
  session.set(null);
  assert.equal(session.get(), null);
});
