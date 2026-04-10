import * as vscode from "vscode";
import { WorkspaceIndex } from "../gram/workspaceIndex";
import {
  createRuleChildHover,
  createRuleChildOutOfRangeHover,
  createRulePreviewHover,
} from "./hoverUtils";

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
  public constructor(private readonly workspaceIndex: WorkspaceIndex) {}

  public async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    const methods = this.workspaceIndex.getTransformerMethods(document);
    const grammarMap = await this.workspaceIndex.getGrammarDefinitionMap();
    const lenses: vscode.CodeLens[] = [];

    for (const method of methods) {
      const targets = grammarMap.get(method.ruleName);
      if (!targets || targets.length === 0) {
        continue;
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
