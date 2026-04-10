import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildKeywordRuleSource,
  getKeywordRuleNameFromFileName,
  getKeywordRuleNameFromPath,
  parseKeywordListEntries,
} from "../gram/keywords";

test("maps keyword list files to synthetic rule names", () => {
  assert.equal(getKeywordRuleNameFromFileName("unreserved_keyword.list"), "UnreservedKeyword");
  assert.equal(
    getKeywordRuleNameFromPath("/tmp/project/grammar/keywords/type_name_keyword.list"),
    "TypeNameKeyword",
  );
  assert.equal(getKeywordRuleNameFromFileName("unknown.list"), undefined);
});

test("parses keyword list entries and skips blanks/comments", () => {
  assert.deepEqual(
    parseKeywordListEntries("ABORT\n\n# comment\nACCESS\n"),
    ["ABORT", "ACCESS"],
  );
});

test("builds synthetic grammar rule source from keyword entries", () => {
  assert.equal(
    buildKeywordRuleSource("ReservedKeyword", ["ALL", "ANALYZE"]),
    "ReservedKeyword <- 'ALL' /\n    'ANALYZE'",
  );
});
