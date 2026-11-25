// Every call Provbana's own test suite makes to its summariser and its
// document detection, replayed against the port (test/corpus/, captured with
// tools/capture_plugin.py). Deliberately odd input for the most part: the
// malformed, the half-filled and the contradictory.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { detectDocumentType, summarize } from "../src/summarize.js";
import { parseJson } from "../src/datatypes.js";

const lines = readFileSync(new URL("corpus/provbana-tests.jsonl", import.meta.url), "utf8")
  .split("\n").filter(Boolean);

test(`${lines.length} cases from Provbana's test suite`, () => {
  for (const [n, line] of lines.entries()) {
    const row = parseJson(line);
    if (row.kind === "detect") {
      assert.equal(detectDocumentType(row.bundle).id, row.result, `case ${n}`);
      continue;
    }
    const got = JSON.parse(JSON.stringify(summarize(row.bundle, { today: row.today })));
    const want = JSON.parse(JSON.stringify(row.result));
    assert.deepStrictEqual(got, want, `case ${n}`);
    assert.deepStrictEqual(Object.keys(got.quality.gaps), Object.keys(want.quality.gaps),
      `case ${n}`);
  }
});
