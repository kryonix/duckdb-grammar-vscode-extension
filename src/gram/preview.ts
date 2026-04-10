import { GramRuleDefinition } from "./types";

const DEFAULT_MAX_LINES = 12;
const DEFAULT_MAX_CHARACTERS = 900;

export function getRuleSource(text: string, rule: GramRuleDefinition): string {
  return text.slice(rule.fullStart, rule.fullEnd).trimEnd();
}

export function formatRulePreview(
  source: string,
  options?: {
    readonly maxLines?: number;
    readonly maxCharacters?: number;
  },
): string {
  const maxLines = options?.maxLines ?? DEFAULT_MAX_LINES;
  const maxCharacters = options?.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const trimmedSource = source.trimEnd();

  if (trimmedSource.length === 0) {
    return source;
  }

  const lines = trimmedSource.split(/\r?\n/u);
  let preview = trimmedSource;

  if (lines.length > maxLines) {
    preview = `${lines.slice(0, maxLines).join("\n")}\n...`;
  }

  if (preview.length > maxCharacters) {
    preview = `${preview.slice(0, maxCharacters).trimEnd()}...`;
  }

  return preview;
}
