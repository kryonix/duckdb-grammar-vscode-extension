import * as vscode from "vscode";
import { formatExpressionHintLabel } from "../gram/expression";
import { IndexedRuleChildMatch, WorkspaceIndex } from "../gram/workspaceIndex";
import {
  createRuleChildHover,
  createRuleChildOutOfRangeHover,
  createRulePreviewHover,
} from "./hoverUtils";

const CHILD_HINT_MAX_LENGTH = 28;

const rangeFromOffsets = (
  document: vscode.TextDocument,
  start: number,
  end: number,
): vscode.Range => new vscode.Range(document.positionAt(start), document.positionAt(end));

const createChildLocations = (
  matches: readonly IndexedRuleChildMatch[],
): vscode.Location[] =>
  matches.map(
    (match) =>
      new vscode.Location(
        match.document.uri,
        rangeFromOffsets(match.document, match.childStart, match.childEnd),
      ),
  );

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

export class TransformerDefinitionProvider implements vscode.DefinitionProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Definition | undefined> {
    const method = this.workspaceIndex.findTransformerMethodAtOffset(document, document.offsetAt(position));
    if (!method) {
      return undefined;
    }

    return this.workspaceIndex.getRuleDefinitions(method.ruleName, [document]);
  }
}

export class TransformerCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();

  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this.onDidChangeCodeLensesEmitter.event;

  public refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  public dispose(): void {
    this.onDidChangeCodeLensesEmitter.dispose();
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    const methods = this.workspaceIndex.getTransformerMethods(document);
    const [grammarMap, childMaps] = await Promise.all([
      this.workspaceIndex.getGrammarDefinitionMap(),
      this.workspaceIndex.getRuleChildMatchMaps(
        methods.map((method) => method.ruleName),
        [document],
      ),
    ]);
    const lenses: vscode.CodeLens[] = [];

    for (const method of methods) {
      const targets = grammarMap.get(method.ruleName);
      if (!targets || targets.length === 0) {
        continue;
      }

      const childMap = childMaps.get(method.ruleName);
      if (childMap && childMap.size > 0) {
        for (const [childIndex, matches] of [...childMap.entries()].sort(
          ([left], [right]) => left - right,
        )) {
          const childMatch = matches[0];
          lenses.push(
            new vscode.CodeLens(
              rangeFromOffsets(document, method.nameStart, method.nameEnd),
              createPeekOrOpenCommand(
                document.uri,
                document.positionAt(method.nameStart),
                createChildLocations(matches),
                `[${childIndex}] ${formatExpressionHintLabel(
                  childMatch.childSource,
                  CHILD_HINT_MAX_LENGTH,
                )}`,
                `[${childIndex}] ${formatExpressionHintLabel(
                  childMatch.childSource,
                  CHILD_HINT_MAX_LENGTH,
                )}`,
              ),
            ),
          );
        }
      }

      lenses.push(
        new vscode.CodeLens(
          rangeFromOffsets(document, method.nameStart, method.nameEnd),
          createPeekOrOpenCommand(
            document.uri,
            document.positionAt(method.nameStart),
            targets,
            "Open grammar rule",
            "Peek grammar rules",
          ),
        ),
      );
    }

    return lenses;
  }
}

export class TransformerHoverProvider implements vscode.HoverProvider {
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    const offset = document.offsetAt(position);
    const method = this.workspaceIndex.findTransformerMethodAtOffset(document, offset);
    if (!method) {
      const childAccess = this.workspaceIndex.findTransformerChildAccessAtOffset(document, offset);
      if (!childAccess) {
        return undefined;
      }

      const matches = await this.workspaceIndex.getRuleChildMatches(
        childAccess.method.ruleName,
        childAccess.childIndex,
        [document],
      );
      if (matches.length > 0) {
        return createRuleChildHover(
          childAccess.method.ruleName,
          childAccess.childIndex,
          matches,
        );
      }

      const childCount = await this.workspaceIndex.getRuleChildCount(
        childAccess.method.ruleName,
        [document],
      );
      return childCount === undefined
        ? undefined
        : createRuleChildOutOfRangeHover(
            childAccess.method.ruleName,
            childAccess.childIndex,
            childCount,
          );
    }

    const matches = await this.workspaceIndex.getRulePreviews(method.ruleName, [document]);
    return createRulePreviewHover(`Grammar rule: ${method.ruleName}`, matches);
  }
}
