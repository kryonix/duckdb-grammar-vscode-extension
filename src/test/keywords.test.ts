import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildKeywordRuleSource,
  getKeywordRuleNameFromFileName,
  getKeywordRuleNameFromPath,
  isKeywordBackedRuleName,
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

test("recognizes keyword-backed pseudo-rule names", () => {
  assert.equal(isKeywordBackedRuleName("UnreservedKeyword"), true);
  assert.equal(isKeywordBackedRuleName("ColumnNameKeyword"), true);
  assert.equal(isKeywordBackedRuleName("Identifier"), false);
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
