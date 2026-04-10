import { TransformerMethod } from "./types";

const TRANSFORMER_PATTERN =
  /PEGTransformerFactory::Transform([A-Z][A-Za-z0-9]*)\s*\(/g;

export function parseTransformerMethods(text: string): readonly TransformerMethod[] {
  const methods: TransformerMethod[] = [];

  for (const match of text.matchAll(TRANSFORMER_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }

    const ruleName = match[1];
    const methodName = `Transform${ruleName}`;
    const nameStart = match.index + match[0].indexOf(methodName);

    methods.push({
      ruleName,
      nameStart,
      nameEnd: nameStart + methodName.length,
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
