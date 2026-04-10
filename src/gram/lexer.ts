import { GramToken, GramTokenType } from "./types";

enum ParseState {
  RuleName,
  RuleSeparator,
  RuleDefinition,
}

const isAlphaNumeric = (char: string): boolean => /[A-Za-z0-9_]/.test(char);

const isWhitespace = (char: string): boolean =>
  char === " " || char === "\t" || char === "\n" || char === "\r";

const token = (
  type: GramTokenType,
  text: string,
  start: number,
  end: number,
): GramToken => ({ type, text, start, end });

export function lexGram(text: string): readonly GramToken[] {
  const tokens: GramToken[] = [];

  let pos = 0;
  let state = ParseState.RuleName;
  let bracketCount = 0;
  let inOrClause = false;
  let ruleBodyEmpty = false;
  let parameterState = 0;

  const charAt = (index: number): string => text.charAt(index);

  while (pos < text.length) {
    const start = pos;
    const current = charAt(pos);

    if (current === "#") {
      pos += 1;
      while (pos < text.length && charAt(pos) !== "\n" && charAt(pos) !== "\r") {
        pos += 1;
      }
      tokens.push(token(GramTokenType.Comment, text.slice(start, pos), start, pos));
      continue;
    }

    if (state === ParseState.RuleDefinition && (current === "\n" || current === "\r")) {
      if (bracketCount === 0 && !inOrClause) {
        if (ruleBodyEmpty) {
          while (
            pos < text.length &&
            (charAt(pos) === "\n" ||
              charAt(pos) === "\r" ||
              charAt(pos) === " " ||
              charAt(pos) === "\t")
          ) {
            pos += 1;
          }
          tokens.push(token(GramTokenType.WhiteSpace, text.slice(start, pos), start, pos));
          continue;
        }

        while (pos < text.length && (charAt(pos) === "\n" || charAt(pos) === "\r")) {
          pos += 1;
        }
        tokens.push(token(GramTokenType.WhiteSpace, text.slice(start, pos), start, pos));
        state = ParseState.RuleName;
        bracketCount = 0;
        inOrClause = false;
        ruleBodyEmpty = false;
        parameterState = 0;
        continue;
      }

      while (
        pos < text.length &&
        (charAt(pos) === "\n" ||
          charAt(pos) === "\r" ||
          charAt(pos) === " " ||
          charAt(pos) === "\t")
      ) {
        pos += 1;
      }
      tokens.push(token(GramTokenType.WhiteSpace, text.slice(start, pos), start, pos));
      continue;
    }

    if (isWhitespace(current)) {
      pos += 1;
      while (pos < text.length && isWhitespace(charAt(pos))) {
        pos += 1;
      }
      tokens.push(token(GramTokenType.WhiteSpace, text.slice(start, pos), start, pos));
      continue;
    }

    switch (state) {
      case ParseState.RuleName: {
        if (current === "/") {
          pos += 1;
          tokens.push(token(GramTokenType.Choice, text.slice(start, pos), start, pos));
          state = ParseState.RuleDefinition;
          bracketCount = 0;
          inOrClause = true;
          ruleBodyEmpty = false;
          continue;
        }

        if (current === "%") {
          pos += 1;
        }
        while (pos < text.length && isAlphaNumeric(charAt(pos))) {
          pos += 1;
        }

        if (pos === start || (current === "%" && pos === start + 1)) {
          pos = start + 1;
          tokens.push(token(GramTokenType.BadChar, text.slice(start, pos), start, pos));
          continue;
        }

        tokens.push(token(GramTokenType.RuleName, text.slice(start, pos), start, pos));
        state = ParseState.RuleSeparator;
        parameterState = 0;
        continue;
      }

      case ParseState.RuleSeparator: {
        if (current === "(") {
          pos += 1;
          tokens.push(token(GramTokenType.Operator, text.slice(start, pos), start, pos));
          parameterState = 1;
          continue;
        }

        if (parameterState === 1 && isAlphaNumeric(current)) {
          pos += 1;
          while (pos < text.length && isAlphaNumeric(charAt(pos))) {
            pos += 1;
          }
          tokens.push(token(GramTokenType.Parameter, text.slice(start, pos), start, pos));
          parameterState = 2;
          continue;
        }

        if (parameterState === 2 && current === ")") {
          pos += 1;
          tokens.push(token(GramTokenType.Operator, text.slice(start, pos), start, pos));
          parameterState = 0;
          continue;
        }

        if (current === "<" && charAt(pos + 1) === "-") {
          pos += 2;
          tokens.push(token(GramTokenType.Separator, text.slice(start, pos), start, pos));
          state = ParseState.RuleDefinition;
          ruleBodyEmpty = true;
          bracketCount = 0;
          inOrClause = false;
          parameterState = 0;
          continue;
        }

        pos += 1;
        tokens.push(token(GramTokenType.BadChar, text.slice(start, pos), start, pos));
        continue;
      }

      case ParseState.RuleDefinition: {
        inOrClause = false;
        ruleBodyEmpty = false;

        if (current === "'") {
          pos += 1;
          while (pos < text.length && charAt(pos) !== "'") {
            if (charAt(pos) === "\\") {
              pos += 1;
            }
            pos += 1;
          }
          if (pos < text.length) {
            pos += 1;
          }
          tokens.push(token(GramTokenType.Literal, text.slice(start, pos), start, pos));
          continue;
        }

        if (current === "[" || current === "<") {
          const closingChar = current === "[" ? "]" : ">";
          pos += 1;
          while (pos < text.length && charAt(pos) !== closingChar) {
            if (charAt(pos) === "\\") {
              pos += 1;
            }
            pos += 1;
          }
          if (pos < text.length) {
            pos += 1;
          }
          tokens.push(token(GramTokenType.Regex, text.slice(start, pos), start, pos));
          continue;
        }

        if (isAlphaNumeric(current)) {
          pos += 1;
          while (pos < text.length && isAlphaNumeric(charAt(pos))) {
            pos += 1;
          }
          tokens.push(token(GramTokenType.Reference, text.slice(start, pos), start, pos));
          continue;
        }

        if (current === "(") {
          pos += 1;
          bracketCount += 1;
          tokens.push(token(GramTokenType.Operator, text.slice(start, pos), start, pos));
          continue;
        }

        if (current === ")") {
          pos += 1;
          bracketCount = Math.max(0, bracketCount - 1);
          tokens.push(token(GramTokenType.Operator, text.slice(start, pos), start, pos));
          continue;
        }

        if (current === "/") {
          pos += 1;
          tokens.push(token(GramTokenType.Choice, text.slice(start, pos), start, pos));
          inOrClause = true;
          continue;
        }

        if (current === "?" || current === "*" || current === "+") {
          pos += 1;
          tokens.push(token(GramTokenType.Quantifier, text.slice(start, pos), start, pos));
          continue;
        }

        if (current === "!") {
          pos += 1;
          tokens.push(token(GramTokenType.Operator, text.slice(start, pos), start, pos));
          continue;
        }

        pos += 1;
        tokens.push(token(GramTokenType.BadChar, text.slice(start, pos), start, pos));
        continue;
      }
    }
  }

  return tokens;
}
