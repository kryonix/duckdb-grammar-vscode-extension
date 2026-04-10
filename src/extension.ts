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
  const transformerCodeLensProvider = new TransformerCodeLensProvider(workspaceIndex);
  const grammarWatcher = vscode.workspace.createFileSystemWatcher("**/*.gram");
  const refreshTransformerCodeLenses = (uri: vscode.Uri): void => {
    if (workspaceIndex.invalidateGrammarWorkspaceCache(uri)) {
      transformerCodeLensProvider.refresh();
    }
  };

  context.subscriptions.push(
    transformerCodeLensProvider,
    grammarWatcher,
    grammarWatcher.onDidCreate(refreshTransformerCodeLenses),
    grammarWatcher.onDidChange(refreshTransformerCodeLenses),
    grammarWatcher.onDidDelete(refreshTransformerCodeLenses),
    vscode.workspace.onDidRenameFiles((event) => {
      for (const file of event.files) {
        refreshTransformerCodeLenses(file.oldUri);
        refreshTransformerCodeLenses(file.newUri);
      }
    }),
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
      transformerCodeLensProvider,
    ),
  );
}

export function deactivate(): void {}
