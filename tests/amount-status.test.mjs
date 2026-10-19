import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

const { formatAmountInput } = await load("../src/components/amount-format.ts");
const { statusTone } = await load("../src/components/statusTone.ts");

test("amount input groups whole digits while preserving decimal typing", () => {
  assert.equal(formatAmountInput("1234"), "1,234");
  assert.equal(formatAmountInput("1234567.05"), "1,234,567.05");
  assert.equal(formatAmountInput("1234."), "1,234.");
  assert.equal(formatAmountInput("0.0001"), "0.0001");
  assert.equal(formatAmountInput("12a3"), "12a3");
});

test("payment and delivery states use full, partial, and none colors", () => {
  for (const state of ["FULLY_PAID", "FULLY_DELIVERED"])
    assert.equal(statusTone(state), "good");
  for (const state of ["PARTLY_PAID", "PARTLY_DELIVERED"])
    assert.equal(statusTone(state), "partial");
  for (const state of ["NOT_PAID", "NOT_DELIVERED"])
    assert.equal(statusTone(state), "unpaid");
});
