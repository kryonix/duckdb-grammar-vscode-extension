const KEYWORD_RULE_FILE_NAMES = new Map<string, string>([
  ["unreserved_keyword.list", "UnreservedKeyword"],
  ["reserved_keyword.list", "ReservedKeyword"],
  ["column_name_keyword.list", "ColumnNameKeyword"],
  ["func_name_keyword.list", "FuncNameKeyword"],
  ["type_name_keyword.list", "TypeNameKeyword"],
]);
const KEYWORD_RULE_NAMES = new Set(KEYWORD_RULE_FILE_NAMES.values());

const escapeLiteral = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

export function getKeywordRuleNameFromFileName(fileName: string): string | undefined {
  return KEYWORD_RULE_FILE_NAMES.get(fileName);
}

export function getKeywordRuleNameFromPath(path: string): string | undefined {
  const fileName = path.split("/").at(-1) ?? path;
  return getKeywordRuleNameFromFileName(fileName);
}

export function isKeywordBackedRuleName(ruleName: string): boolean {
  return KEYWORD_RULE_NAMES.has(ruleName);
}

export function parseKeywordListEntries(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function buildKeywordRuleSource(
  ruleName: string,
  entries: readonly string[],
): string {
  if (entries.length === 0) {
    return `${ruleName} <-`;
  }

  return `${ruleName} <- ${entries
    .map((entry) => `'${escapeLiteral(entry)}'`)
    .join(" /\n    ")}`;
}
