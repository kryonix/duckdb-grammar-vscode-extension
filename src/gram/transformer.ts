import { TransformerChildAccess, TransformerMethod } from "./types";

const TRANSFORMER_PATTERN =
  /PEGTransformerFactory::Transform([A-Z][A-Za-z0-9]*)\s*\(/g;
const LIST_PARSE_RESULT_VARIABLE_PATTERN =
  /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*parse_result->Cast<ListParseResult>\(\)/g;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const findMatchingBrace = (text: string, openBrace: number): number | undefined => {
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = openBrace; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (current === "\\") {
        index += 1;
        continue;
      }
      if (current === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (current === "\\") {
        index += 1;
        continue;
      }
      if (current === "\"") {
        inDoubleQuote = false;
      }
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (current === "'") {
      inSingleQuote = true;
      continue;
    }

    if (current === "\"") {
      inDoubleQuote = true;
      continue;
    }

    if (current === "{") {
      depth += 1;
      continue;
    }

    if (current === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
};

const findListResultVariables = (text: string): readonly string[] => {
  const names = new Set<string>();

  for (const match of text.matchAll(LIST_PARSE_RESULT_VARIABLE_PATTERN)) {
    names.add(match[1]);
  }

  return [...names];
};

const collectChildAccesses = (
  text: string,
  bodyStart: number,
  variableName: string,
  accesses: TransformerChildAccess[],
): void => {
  const escapedVariable = escapeRegExp(variableName);
  const patterns = [
    new RegExp(`\\b${escapedVariable}\\s*\\.\\s*children\\s*\\[\\s*(\\d+)\\s*\\]`, "gu"),
    new RegExp(`\\b${escapedVariable}\\s*\\.\\s*Child\\s*<[^>]+>\\s*\\(\\s*(\\d+)\\s*\\)`, "gu"),
    new RegExp(`\\b${escapedVariable}\\s*\\.\\s*GetChild\\s*\\(\\s*(\\d+)\\s*\\)`, "gu"),
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      accesses.push({
        childIndex: Number.parseInt(match[1], 10),
        start: bodyStart + match.index,
        end: bodyStart + match.index + match[0].length,
        variableName,
      });
    }
  }
};

const findChildAccesses = (
  text: string,
  bodyStart: number,
  variableNames: readonly string[],
): readonly TransformerChildAccess[] => {
  const accesses: TransformerChildAccess[] = [];

  for (const variableName of variableNames) {
    collectChildAccesses(text, bodyStart, variableName, accesses);
  }

  accesses.sort((left, right) => left.start - right.start);
  return accesses;
};

export function parseTransformerMethods(text: string): readonly TransformerMethod[] {
  const methods: TransformerMethod[] = [];

  for (const match of text.matchAll(TRANSFORMER_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }

    const ruleName = match[1];
    const methodName = `Transform${ruleName}`;
    const nameStart = match.index + match[0].indexOf(methodName);
    const bodyStart = text.indexOf("{", match.index + match[0].length);
    const bodyEnd = bodyStart >= 0 ? findMatchingBrace(text, bodyStart) : undefined;
    const methodBody =
      bodyStart >= 0 && bodyEnd !== undefined ? text.slice(bodyStart, bodyEnd + 1) : "";
    const listResultVariables = findListResultVariables(methodBody);
    const childAccesses =
      bodyStart >= 0
        ? findChildAccesses(methodBody, bodyStart, listResultVariables)
        : [];

    methods.push({
      ruleName,
      nameStart,
      nameEnd: nameStart + methodName.length,
      bodyStart: bodyStart >= 0 ? bodyStart : undefined,
      bodyEnd: bodyEnd !== undefined ? bodyEnd + 1 : undefined,
      listResultVariables,
      childAccesses,
    });
  }

  return methods;
}

export function findTransformerMethodAtOffset(
  methods: readonly TransformerMethod[],
  offset: number,
): TransformerMethod | undefined {
  for (const method of methods) {
    if (offset >= method.nameStart && offset < method.nameEnd) {
      return method;
    }
  }
  return undefined;
}

export function findTransformerMethodContainingOffset(
  methods: readonly TransformerMethod[],
  offset: number,
): TransformerMethod | undefined {
  for (const method of methods) {
    if (
      method.bodyStart !== undefined &&
      method.bodyEnd !== undefined &&
      offset >= method.bodyStart &&
      offset < method.bodyEnd
    ) {
      return method;
    }
  }

  return findTransformerMethodAtOffset(methods, offset);
}

export function findTransformerChildAccessAtOffset(
  methods: readonly TransformerMethod[],
  offset: number,
): { method: TransformerMethod; access: TransformerChildAccess } | undefined {
  for (const method of methods) {
    if (
      method.bodyStart === undefined ||
      method.bodyEnd === undefined ||
      offset < method.bodyStart ||
      offset >= method.bodyEnd
    ) {
      continue;
    }

    for (const access of method.childAccesses) {
      if (offset >= access.start && offset < access.end) {
        return { method, access };
      }
    }
  }

  return undefined;
}
