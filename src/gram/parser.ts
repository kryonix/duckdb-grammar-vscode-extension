import {
  GramReferenceOccurrence,
  GramRuleDefinition,
  GramToken,
  GramTokenType,
  ParsedGramDocument,
} from "./types";
import { getRuleChildSlots, parseRuleExpression } from "./expression";
import { lexGram } from "./lexer";

export const stripRulePrefix = (ruleName: string): string =>
  ruleName.startsWith("%") ? ruleName.slice(1) : ruleName;

const isSkippableAtRuleStart = (token: GramToken): boolean =>
  token.type === GramTokenType.WhiteSpace || token.type === GramTokenType.Comment;

const isWhitespace = (token: GramToken): boolean => token.type === GramTokenType.WhiteSpace;

export function parseGram(text: string): ParsedGramDocument {
  const tokens = lexGram(text);
  const rules: GramRuleDefinition[] = [];

  let index = 0;

  while (index < tokens.length) {
    while (index < tokens.length && isSkippableAtRuleStart(tokens[index])) {
      index += 1;
    }

    if (index >= tokens.length) {
      break;
    }

    const nameToken = tokens[index];
    if (nameToken.type !== GramTokenType.RuleName) {
      index += 1;
      continue;
    }

    index += 1;

    let parameter: string | undefined;
    let separatorToken: GramToken | undefined;
    let bodyTokenStart = index;

    while (index < tokens.length && tokens[index].type !== GramTokenType.RuleName) {
      const current = tokens[index];
      if (current.type === GramTokenType.Parameter && parameter === undefined) {
        parameter = current.text;
      }
      if (current.type === GramTokenType.Separator) {
        separatorToken = current;
        index += 1;
        bodyTokenStart = index;
        break;
      }
      index += 1;
    }

    const references: GramReferenceOccurrence[] = [];
    let bodyEnd = separatorToken?.end ?? nameToken.end;
    let fullEnd = separatorToken?.end ?? nameToken.end;

    while (index < tokens.length && tokens[index].type !== GramTokenType.RuleName) {
      const current = tokens[index];
      if (current.type === GramTokenType.Reference) {
        references.push({
          name: stripRulePrefix(current.text),
          start: current.start,
          end: current.end,
        });
      }
      if (!isWhitespace(current)) {
        bodyEnd = current.end;
        fullEnd = current.end;
      }
      index += 1;
    }

    const expression = parseRuleExpression(tokens.slice(bodyTokenStart, index));

    rules.push({
      name: stripRulePrefix(nameToken.text),
      rawName: nameToken.text,
      parameter,
      nameStart: nameToken.start,
      nameEnd: nameToken.end,
      separatorStart: separatorToken?.start ?? nameToken.end,
      separatorEnd: separatorToken?.end ?? nameToken.end,
      bodyStart: separatorToken?.end ?? nameToken.end,
      bodyEnd,
      fullStart: nameToken.start,
      fullEnd,
      references,
      expression,
      children: getRuleChildSlots(expression),
    });
  }

  return { tokens, rules };
}

export function findTokenAtOffset(
  parsed: ParsedGramDocument,
  offset: number,
): GramToken | undefined {
  for (const current of parsed.tokens) {
    if (offset >= current.start && offset < current.end) {
      return current;
    }
  }
  return undefined;
}
