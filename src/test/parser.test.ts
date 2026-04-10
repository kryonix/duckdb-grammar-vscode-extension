import * as assert from "node:assert/strict";
import { test } from "node:test";
import { lexGram } from "../gram/lexer";
import { parseGram } from "../gram/parser";
import { formatRulePreview, getRuleSource } from "../gram/preview";
import { parseTransformerMethods } from "../gram/transformer";
import { GramTokenType } from "../gram/types";

test("lexes a simple rule with parameter, grouping, and quantifier", () => {
  const tokens = lexGram("List(D) <- D (',' D)*");

  assert.deepEqual(
    tokens.map((token) => [token.type, token.text]),
    [
      [GramTokenType.RuleName, "List"],
      [GramTokenType.Operator, "("],
      [GramTokenType.Parameter, "D"],
      [GramTokenType.Operator, ")"],
      [GramTokenType.WhiteSpace, " "],
      [GramTokenType.Separator, "<-"],
      [GramTokenType.WhiteSpace, " "],
      [GramTokenType.Reference, "D"],
      [GramTokenType.WhiteSpace, " "],
      [GramTokenType.Operator, "("],
      [GramTokenType.Literal, "','"],
      [GramTokenType.WhiteSpace, " "],
      [GramTokenType.Reference, "D"],
      [GramTokenType.Operator, ")"],
      [GramTokenType.Quantifier, "*"],
    ],
  );
});

test("lexes multiline alternatives using leading slash continuation", () => {
  const tokens = lexGram(
    "SingleExpression <-\n    ParensExpression\n    / LiteralExpression\n    / Parameter",
  );

  assert.deepEqual(
    tokens.map((token) => [token.type, token.text]),
    [
      [GramTokenType.RuleName, "SingleExpression"],
      [GramTokenType.WhiteSpace, " "],
      [GramTokenType.Separator, "<-"],
      [GramTokenType.WhiteSpace, "\n    "],
      [GramTokenType.Reference, "ParensExpression"],
      [GramTokenType.WhiteSpace, "\n"],
      [GramTokenType.WhiteSpace, "    "],
      [GramTokenType.Choice, "/"],
      [GramTokenType.WhiteSpace, " "],
      [GramTokenType.Reference, "LiteralExpression"],
      [GramTokenType.WhiteSpace, "\n"],
      [GramTokenType.WhiteSpace, "    "],
      [GramTokenType.Choice, "/"],
      [GramTokenType.WhiteSpace, " "],
      [GramTokenType.Reference, "Parameter"],
    ],
  );
});

test("parses rules and cross-rule references", () => {
  const parsed = parseGram(
    "# header\n%root <- stmt\nstmt <- term / otherRule\notherRule <- 'x'\n",
  );

  assert.equal(parsed.rules.length, 3);
  assert.deepEqual(
    parsed.rules.map((rule) => ({
      name: rule.name,
      parameter: rule.parameter,
      references: rule.references.map((reference) => reference.name),
    })),
    [
      { name: "root", parameter: undefined, references: ["stmt"] },
      { name: "stmt", parameter: undefined, references: ["term", "otherRule"] },
      { name: "otherRule", parameter: undefined, references: [] },
    ],
  );
});

test("handles rule bodies that begin on the next line", () => {
  const parsed = parseGram("rule <-\n    a / b\nnext <- item");

  assert.equal(parsed.rules.length, 2);
  assert.deepEqual(parsed.rules[0].references.map((reference) => reference.name), ["a", "b"]);
  assert.equal(parsed.rules[1].name, "next");
});

test("computes direct child slots for transformer indexing", () => {
  const source =
    "CreateTableAs <- IdentifierList? PartitionSortedOptions? WithList? 'AS' SelectStatementInternal WithData?";
  const parsed = parseGram(source);

  assert.deepEqual(
    parsed.rules[0].children.map((child) => source.slice(child.start, child.end)),
    [
      "IdentifierList?",
      "PartitionSortedOptions?",
      "WithList?",
      "'AS'",
      "SelectStatementInternal",
      "WithData?",
    ],
  );
});

test("treats a top-level choice as a single direct child", () => {
  const source = "DistinctOrAll <- 'DISTINCT' / 'ALL'";
  const parsed = parseGram(source);

  assert.equal(parsed.rules[0].children.length, 1);
  assert.equal(
    source.slice(parsed.rules[0].children[0].start, parsed.rules[0].children[0].end),
    "'DISTINCT' / 'ALL'",
  );
});

test("captures full multiline rule text for hover previews", () => {
  const source = "rule <-\n    first\n    / second\nnext <- item";
  const parsed = parseGram(source);

  assert.equal(getRuleSource(source, parsed.rules[0]), "rule <-\n    first\n    / second");
});

test("formats long hover previews with truncation", () => {
  const preview = formatRulePreview(
    "rule <-\n    a\n    / b\n    / c\n    / d",
    { maxLines: 3, maxCharacters: 20 },
  );

  assert.equal(preview, "rule <-\n    a\n    /...");
});

test("extracts transformer methods from C++ files", () => {
  const source = `
void PEGTransformerFactory::TransformSelectNode(ParserExtensionInfo *) {}
auto PEGTransformerFactory::TransformAttachStatement() -> unique_ptr<ParsedExpression> {}
`;
  const methods = parseTransformerMethods(source);

  assert.deepEqual(
    methods.map((method) => ({
      ruleName: method.ruleName,
      nameStart: method.nameStart,
      nameEnd: method.nameEnd,
    })),
    [
      {
        ruleName: "SelectNode",
        nameStart: source.indexOf("TransformSelectNode"),
        nameEnd: source.indexOf("TransformSelectNode") + "TransformSelectNode".length,
      },
      {
        ruleName: "AttachStatement",
        nameStart: source.indexOf("TransformAttachStatement"),
        nameEnd:
          source.indexOf("TransformAttachStatement") + "TransformAttachStatement".length,
      },
    ],
  );
});

test("tracks child access patterns inside transformer methods", () => {
  const source = `
auto PEGTransformerFactory::TransformCreateTableAs() -> CreateTableAs {
  auto &node = parse_result->Cast<ListParseResult>();
  auto as_keyword = node.children[3];
  auto query = node.Child<ListParseResult>(4);
  auto with_data = node.GetChild(5);
}
`;
  const methods = parseTransformerMethods(source);

  assert.deepEqual(methods[0].listResultVariables, ["node"]);
  assert.deepEqual(
    methods[0].childAccesses.map((access) => ({
      childIndex: access.childIndex,
      variableName: access.variableName,
    })),
    [
      { childIndex: 3, variableName: "node" },
      { childIndex: 4, variableName: "node" },
      { childIndex: 5, variableName: "node" },
    ],
  );
});
