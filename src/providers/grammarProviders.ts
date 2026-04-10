import * as vscode from "vscode";
import { stripRulePrefix } from "../gram/parser";
import { GramTokenType } from "../gram/types";
import { WorkspaceIndex } from "../gram/workspaceIndex";

const semanticLegend = new vscode.SemanticTokensLegend(
  ["function", "variable", "operator", "string", "regexp", "parameter", "comment"],
  ["declaration"],
);

const rangeFromOffsets = (
  document: vscode.TextDocument,
  start: number,
  end: number,
): vscode.Range => new vscode.Range(document.positionAt(start), document.positionAt(end));

const createPeekOrOpenCommand = (
  sourceUri: vscode.Uri,
  sourcePosition: vscode.Position,
  targets: readonly vscode.Location[],
  singularTitle: string,
  pluralTitle: string,
): vscode.Command => {
  if (targets.length === 1) {
    return {
      title: singularTitle,
      command: "vscode.open",
      arguments: [
        targets[0].uri,
        {
          selection: targets[0].range,
        },
      ],
    };
  }

  return {
    title: `${pluralTitle} (${targets.length})`,
    command: "editor.action.peekLocations",
    arguments: [sourceUri, sourcePosition, targets, "peek"],
  };
};

export function getSemanticLegend(): vscode.SemanticTokensLegend {
  return semanticLegend;
}

export class GramSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public provideDocumentSemanticTokens(
    document: vscode.TextDocument,
  ): vscode.SemanticTokens {
    const parsed = this.workspaceIndex.getParsedGramDocument(document);
    const builder = new vscode.SemanticTokensBuilder(semanticLegend);

    for (const token of parsed.tokens) {
      switch (token.type) {
        case GramTokenType.RuleName:
          builder.push(rangeFromOffsets(document, token.start, token.end), "function", ["declaration"]);
          break;
        case GramTokenType.Reference:
          builder.push(rangeFromOffsets(document, token.start, token.end), "variable", []);
          break;
        case GramTokenType.Separator:
        case GramTokenType.Operator:
        case GramTokenType.Choice:
        case GramTokenType.Quantifier:
          builder.push(rangeFromOffsets(document, token.start, token.end), "operator", []);
          break;
        case GramTokenType.Literal:
          builder.push(rangeFromOffsets(document, token.start, token.end), "string", []);
          break;
        case GramTokenType.Regex:
          builder.push(rangeFromOffsets(document, token.start, token.end), "regexp", []);
          break;
        case GramTokenType.Parameter:
          builder.push(rangeFromOffsets(document, token.start, token.end), "parameter", []);
          break;
        case GramTokenType.Comment:
          builder.push(rangeFromOffsets(document, token.start, token.end), "comment", []);
          break;
        default:
          break;
      }
    }

    return builder.build();
  }
}

export class GramDefinitionProvider implements vscode.DefinitionProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Definition | undefined> {
    const token = this.workspaceIndex.findGrammarTokenAtOffset(document, document.offsetAt(position));
    if (!token || token.type !== GramTokenType.Reference) {
      return undefined;
    }

    return this.workspaceIndex.getRuleDefinitions(stripRulePrefix(token.text), [document]);
  }
}

export class GramReferenceProvider implements vscode.ReferenceProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Location[] | undefined> {
    const token = this.workspaceIndex.findGrammarTokenAtOffset(document, document.offsetAt(position));
    if (
      !token ||
      (token.type !== GramTokenType.Reference && token.type !== GramTokenType.RuleName)
    ) {
      return undefined;
    }

    return this.workspaceIndex.getRuleReferences(stripRulePrefix(token.text), context.includeDeclaration, [
      document,
    ]);
  }
}

export class GramCompletionProvider implements vscode.CompletionItemProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    _position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[]> {
    const names = await this.workspaceIndex.getAllRuleNames([document]);
    return names.map((name) => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
      item.detail = "DuckDB grammar rule";
      return item;
    });
  }
}

export class GramDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const parsed = this.workspaceIndex.getParsedGramDocument(document);
    return parsed.rules.map((rule) => {
      const symbol = new vscode.DocumentSymbol(
        rule.name,
        rule.parameter ? `parameter: ${rule.parameter}` : "",
        vscode.SymbolKind.Function,
        rangeFromOffsets(document, rule.fullStart, rule.fullEnd),
        rangeFromOffsets(document, rule.nameStart, rule.nameEnd),
      );
      symbol.children = [];
      return symbol;
    });
  }
}

export class GramFoldingRangeProvider implements vscode.FoldingRangeProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const parsed = this.workspaceIndex.getParsedGramDocument(document);
    const ranges: vscode.FoldingRange[] = [];

    for (const rule of parsed.rules) {
      if (rule.bodyEnd <= rule.separatorEnd) {
        continue;
      }

      const startLine = document.positionAt(rule.nameStart).line;
      const endLine = document.positionAt(Math.max(rule.bodyEnd - 1, rule.nameStart)).line;
      if (endLine <= startLine) {
        continue;
      }

      ranges.push(new vscode.FoldingRange(startLine, endLine, vscode.FoldingRangeKind.Region));
    }

    return ranges;
  }
}

export class GramCodeLensProvider implements vscode.CodeLensProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    const parsed = this.workspaceIndex.getParsedGramDocument(document);
    const transformerMap = await this.workspaceIndex.getTransformerDefinitionMap();
    const lenses: vscode.CodeLens[] = [];

    for (const rule of parsed.rules) {
      const targets = transformerMap.get(rule.name);
      if (!targets || targets.length === 0) {
        continue;
      }

      lenses.push(
        new vscode.CodeLens(
          rangeFromOffsets(document, rule.nameStart, rule.nameEnd),
          createPeekOrOpenCommand(
            document.uri,
            document.positionAt(rule.nameStart),
            targets,
            "Open transformer",
            "Peek transformers",
          ),
        ),
      );
    }

    return lenses;
  }
}
