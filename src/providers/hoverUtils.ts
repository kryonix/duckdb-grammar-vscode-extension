import * as vscode from "vscode";
import { formatRulePreview } from "../gram/preview";
import { IndexedRuleMatch } from "../gram/workspaceIndex";

const MAX_PREVIEW_MATCHES = 3;

export function createRulePreviewHover(
  title: string,
  matches: readonly IndexedRuleMatch[],
): vscode.Hover | undefined {
  if (matches.length === 0) {
    return undefined;
  }

  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = false;
  markdown.supportHtml = false;

  const shownMatches = matches.slice(0, MAX_PREVIEW_MATCHES);

  shownMatches.forEach((match, index) => {
    if (index > 0) {
      markdown.appendMarkdown("\n\n---\n\n");
    }

    markdown.appendMarkdown(`**${title}**  \n`);
    markdown.appendMarkdown(`\`${vscode.workspace.asRelativePath(match.document.uri, false)}\`\n\n`);
    markdown.appendCodeblock(formatRulePreview(match.source), "duckdb-gram");
  });

  if (matches.length > shownMatches.length) {
    markdown.appendMarkdown(
      `\n\n_${matches.length - shownMatches.length} more matching rule definition(s) not shown._`,
    );
  }

  return new vscode.Hover(markdown);
}
