import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { MutationObserver, onlineManager } from "@tanstack/react-query";

const asUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let counter = 0;
async function loadClient() {
  const authUrl = asUrl(
    `export const listeners = new Set(); export class ApiError extends Error {} export const session={subscribe:fn=>listeners.add(fn)}; // ${counter++}`,
  );
  const source = await readFile(
    new URL("../src/query.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replaceAll('"./api"', JSON.stringify(authUrl))
    .replaceAll(
      '"@tanstack/react-query"',
      JSON.stringify(import.meta.resolve("@tanstack/react-query")),
    );
  return {
    client: (await import(asUrl(compiled))).queryClient,
    auth: await import(authUrl),
  };
}
test("query reads share cached results, invalidate, and clear on session change", async () => {
  const { client, auth } = await loadClient();
  let reads = 0;
  const query = {
    queryKey: ["sale-options", "staff"],
    queryFn: async () => ++reads,
  };
  assert.equal(await client.fetchQuery(query), 1);
  assert.equal(await client.fetchQuery(query), 1);
  await client.invalidateQueries({ queryKey: query.queryKey });
  assert.equal(await client.fetchQuery(query), 2);
  auth.listeners.forEach((listener) => listener());
  assert.equal(client.getQueryData(query.queryKey), undefined);
  client.clear();
});
test("commands fail immediately offline and never pause for automatic replay", async () => {
  const { client } = await loadClient();
  let calls = 0;
  onlineManager.setOnline(false);
  try {
    const mutation = new MutationObserver(client, {
      mutationFn: async () => {
        calls++;
        throw new Error("Network unavailable");
      },
    });
    await assert.rejects(mutation.mutate(), /Network unavailable/);
    assert.equal(calls, 1);
    assert.equal(mutation.getCurrentResult().isPaused, false);
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
    assert.equal(calls, 1);
  } finally {
    onlineManager.setOnline(true);
    client.clear();
  }
});
