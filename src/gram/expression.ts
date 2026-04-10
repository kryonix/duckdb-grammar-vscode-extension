import {
  GramExpression,
  GramExpressionKind,
  GramRuleChild,
  GramToken,
  GramTokenType,
} from "./types";

const stripRulePrefix = (ruleName: string): string =>
  ruleName.startsWith("%") ? ruleName.slice(1) : ruleName;

const IDENTIFIER_PARSE_RESULT_RULES = new Set([
  "Identifier",
  "ReservedIdentifier",
  "CatalogName",
  "SchemaName",
  "ReservedSchemaName",
  "TableName",
  "ReservedTableName",
  "ColumnName",
  "ReservedColumnName",
  "IndexName",
  "SequenceName",
  "FunctionName",
  "ReservedFunctionName",
  "TableFunctionName",
  "TypeName",
  "PragmaName",
  "SettingName",
  "CopyOptionName",
]);

const isTrivia = (token: GramToken): boolean =>
  token.type === GramTokenType.WhiteSpace || token.type === GramTokenType.Comment;

const normalizeSnippet = (snippet: string): string =>
  snippet.replace(/\s+/gu, " ").trim();

export function getExpressionSource(text: string, expression: GramExpression): string {
  return normalizeSnippet(text.slice(expression.start, expression.end));
}

class RuleExpressionParser {
  private index = 0;

  public constructor(private readonly tokens: readonly GramToken[]) {}

  public parse(): GramExpression | undefined {
    const expression = this.parseChoice();
    this.skipTrivia();
    return expression;
  }

  private parseChoice(): GramExpression | undefined {
    const first = this.parseSequence();
    if (!first) {
      return undefined;
    }

    const alternatives = [first];

    while (this.matchChoice()) {
      const alternative = this.parseSequence();
      if (!alternative) {
        break;
      }
      alternatives.push(alternative);
    }

    if (alternatives.length === 1) {
      return first;
    }

    return {
      kind: GramExpressionKind.Choice,
      start: alternatives[0].start,
      end: alternatives[alternatives.length - 1].end,
      alternatives,
    };
  }

  private parseSequence(): GramExpression | undefined {
    const elements: GramExpression[] = [];

    while (true) {
      this.skipTrivia();
      const current = this.peek();
      if (!current || current.type === GramTokenType.Choice || this.isCloseParen(current)) {
        break;
      }

      const expression = this.parsePostfix();
      if (!expression) {
        break;
      }
      elements.push(expression);
    }

    if (elements.length === 0) {
      return undefined;
    }
    if (elements.length === 1) {
      return elements[0];
    }

    return {
      kind: GramExpressionKind.Sequence,
      start: elements[0].start,
      end: elements[elements.length - 1].end,
      elements,
    };
  }

  private parsePostfix(): GramExpression | undefined {
    let expression = this.parsePrefixed();
    if (!expression) {
      return undefined;
    }

    while (true) {
      this.skipTrivia();
      const token = this.peek();
      if (!token || token.type !== GramTokenType.Quantifier) {
        break;
      }

      this.index += 1;

      if (token.text === "?") {
        expression = {
          kind: GramExpressionKind.Optional,
          start: expression.start,
          end: token.end,
          expression,
        };
        continue;
      }

      if (token.text === "*") {
        expression = {
          kind: GramExpressionKind.ZeroOrMore,
          start: expression.start,
          end: token.end,
          expression,
        };
        continue;
      }

      if (token.text === "+") {
        expression = {
          kind: GramExpressionKind.OneOrMore,
          start: expression.start,
          end: token.end,
          expression,
        };
        continue;
      }
    }

    return expression;
  }

  private parsePrefixed(): GramExpression | undefined {
    this.skipTrivia();
    const token = this.peek();
    if (token?.type === GramTokenType.Operator && token.text === "!") {
      this.index += 1;
      const expression = this.parsePrefixed();
      if (!expression) {
        return undefined;
      }
      return {
        kind: GramExpressionKind.NegativeLookahead,
        start: token.start,
        end: expression.end,
        expression,
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): GramExpression | undefined {
    this.skipTrivia();
    const token = this.peek();
    if (!token) {
      return undefined;
    }

    if (token.type === GramTokenType.Reference) {
      return this.parseReferenceOrFunctionCall();
    }

    if (token.type === GramTokenType.Literal) {
      this.index += 1;
      return {
        kind: GramExpressionKind.Literal,
        start: token.start,
        end: token.end,
        text: token.text,
      };
    }

    if (token.type === GramTokenType.Regex) {
      this.index += 1;
      return {
        kind: GramExpressionKind.Regex,
        start: token.start,
        end: token.end,
        text: token.text,
      };
    }

    if (this.isOpenParen(token)) {
      return this.parseGroup();
    }

    return undefined;
  }

  private parseReferenceOrFunctionCall(): GramExpression {
    const token = this.consume();
    const next = this.peekNonTrivia();

    if (next && this.isOpenParen(next) && token.end === next.start) {
      this.index = this.tokens.indexOf(next) + 1;
      const argument = this.parseChoice();
      const closeParen = this.peek();
      if (closeParen && this.isCloseParen(closeParen)) {
        this.index += 1;
        return {
          kind: GramExpressionKind.FunctionCall,
          start: token.start,
          end: closeParen.end,
          name: stripRulePrefix(token.text),
          rawName: token.text,
          argument,
        };
      }

      return {
        kind: GramExpressionKind.FunctionCall,
        start: token.start,
        end: argument?.end ?? token.end,
        name: stripRulePrefix(token.text),
        rawName: token.text,
        argument,
      };
    }

    return {
      kind: GramExpressionKind.Reference,
      start: token.start,
      end: token.end,
      name: stripRulePrefix(token.text),
      rawName: token.text,
    };
  }

  private parseGroup(): GramExpression | undefined {
    const openParen = this.consume();
    const expression = this.parseChoice();
    this.skipTrivia();

    const closeParen = this.peek();
    if (closeParen && this.isCloseParen(closeParen)) {
      this.index += 1;
      return {
        kind: GramExpressionKind.Group,
        start: openParen.start,
        end: closeParen.end,
        expression,
      };
    }

    return expression
      ? {
          kind: GramExpressionKind.Group,
          start: openParen.start,
          end: expression.end,
          expression,
        }
      : undefined;
  }

  private matchChoice(): boolean {
    this.skipTrivia();
    const token = this.peek();
    if (!token || token.type !== GramTokenType.Choice) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private peek(): GramToken | undefined {
    return this.tokens[this.index];
  }

  private peekNonTrivia(): GramToken | undefined {
    for (let index = this.index; index < this.tokens.length; index += 1) {
      if (!isTrivia(this.tokens[index])) {
        return this.tokens[index];
      }
    }
    return undefined;
  }

  private consume(): GramToken {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private skipTrivia(): void {
    while (this.index < this.tokens.length && isTrivia(this.tokens[this.index])) {
      this.index += 1;
    }
  }

  private isOpenParen(token: GramToken): boolean {
    return token.type === GramTokenType.Operator && token.text === "(";
  }

  private isCloseParen(token: GramToken): boolean {
    return token.type === GramTokenType.Operator && token.text === ")";
  }
}

export function parseRuleExpression(tokens: readonly GramToken[]): GramExpression | undefined {
  return new RuleExpressionParser(tokens).parse();
}

export function getRuleChildSlots(expression: GramExpression | undefined): readonly GramRuleChild[] {
  if (!expression) {
    return [];
  }

  const children =
    expression.kind === GramExpressionKind.Sequence ? expression.elements : [expression];

  return children.map((child, index) => ({
    index,
    start: child.start,
    end: child.end,
    expression: child,
  }));
}

export function getExpressionDisplayText(
  text: string,
  expression: GramExpression,
  maxLength = 80,
): string {
  const snippet = getExpressionSource(text, expression);
  if (snippet.length <= maxLength) {
    return snippet;
  }
  return `${snippet.slice(0, maxLength - 1)}…`;
}

export function formatExpressionHintLabel(
  expressionText: string,
  maxLength = 32,
): string {
  const snippet = normalizeSnippet(expressionText);
  if (snippet.length <= maxLength) {
    return snippet;
  }
  return `${snippet.slice(0, maxLength - 1)}…`;
}

export function getExpressionParseResultType(expression: GramExpression): string {
  switch (expression.kind) {
    case GramExpressionKind.Literal:
      return "KeywordParseResult";
    case GramExpressionKind.Regex:
      return "Regex";
    case GramExpressionKind.Reference:
      if (IDENTIFIER_PARSE_RESULT_RULES.has(expression.name)) {
        return "IdentifierParseResult";
      }
      if (expression.name === "StringLiteral") {
        return "StringLiteralParseResult";
      }
      if (expression.name === "NumberLiteral") {
        return "NumberParseResult";
      }
      if (expression.name === "OperatorLiteral") {
        return "OperatorParseResult";
      }
      return "ListParseResult";
    case GramExpressionKind.FunctionCall:
    case GramExpressionKind.Group:
    case GramExpressionKind.Sequence:
      return "ListParseResult";
    case GramExpressionKind.Choice:
      return "ChoiceParseResult";
    case GramExpressionKind.Optional:
    case GramExpressionKind.ZeroOrMore:
      return "OptionalParseResult";
    case GramExpressionKind.OneOrMore:
      return "RepeatParseResult";
    case GramExpressionKind.NegativeLookahead:
      return getExpressionParseResultType(expression.expression);
  }
}

export function getExpressionParseResultDescription(expression: GramExpression): string {
  if (expression.kind === GramExpressionKind.ZeroOrMore) {
    return "OptionalParseResult wrapping RepeatParseResult";
  }
  return getExpressionParseResultType(expression);
}
