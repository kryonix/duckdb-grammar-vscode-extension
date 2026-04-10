import * as vscode from "vscode";
import { WorkspaceIndex } from "./gram/workspaceIndex";
import {
  GramCodeLensProvider,
  GramCompletionProvider,
  GramDefinitionProvider,
  GramDocumentSymbolProvider,
  GramFoldingRangeProvider,
  GramHoverProvider,
  GramInlayHintProvider,
  GramReferenceProvider,
  GramSemanticTokensProvider,
  getSemanticLegend,
} from "./providers/grammarProviders";
import {
  TransformerCodeLensProvider,
  TransformerDefinitionProvider,
  TransformerHoverProvider,
} from "./providers/transformerProviders";

export function activate(context: vscode.ExtensionContext): void {
  const workspaceIndex = new WorkspaceIndex();
  const grammarSelector: vscode.DocumentSelector = [{ language: "duckdb-gram" }];
  const transformerSelector: vscode.DocumentSelector = [
    { language: "cpp", pattern: "**/transform_*.cpp" },
  ];

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      grammarSelector,
      new GramSemanticTokensProvider(workspaceIndex),
      getSemanticLegend(),
    ),
    vscode.languages.registerDefinitionProvider(
      grammarSelector,
      new GramDefinitionProvider(workspaceIndex),
    ),
    vscode.languages.registerReferenceProvider(
      grammarSelector,
      new GramReferenceProvider(workspaceIndex),
    ),
    vscode.languages.registerHoverProvider(
      grammarSelector,
      new GramHoverProvider(workspaceIndex),
    ),
    vscode.languages.registerInlayHintsProvider(
      grammarSelector,
      new GramInlayHintProvider(workspaceIndex),
    ),
    vscode.languages.registerCompletionItemProvider(
      grammarSelector,
      new GramCompletionProvider(workspaceIndex),
    ),
    vscode.languages.registerDocumentSymbolProvider(
      grammarSelector,
      new GramDocumentSymbolProvider(workspaceIndex),
    ),
    vscode.languages.registerFoldingRangeProvider(
      grammarSelector,
      new GramFoldingRangeProvider(workspaceIndex),
    ),
    vscode.languages.registerCodeLensProvider(
      grammarSelector,
      new GramCodeLensProvider(workspaceIndex),
    ),
    vscode.languages.registerDefinitionProvider(
      transformerSelector,
      new TransformerDefinitionProvider(workspaceIndex),
    ),
    vscode.languages.registerHoverProvider(
      transformerSelector,
      new TransformerHoverProvider(workspaceIndex),
    ),
    vscode.languages.registerCodeLensProvider(
      transformerSelector,
      new TransformerCodeLensProvider(workspaceIndex),
    ),
  );
}

export function deactivate(): void {}
