import * as vscode from "vscode";
import { findTokenAtOffset, parseGram } from "./parser";
import { getRuleSource } from "./preview";
import { findTransformerMethodAtOffset, parseTransformerMethods } from "./transformer";
import { GramRuleDefinition, GramToken, ParsedGramDocument, TransformerMethod } from "./types";

interface CachedGramDocument {
  readonly text: string;
  readonly parsed: ParsedGramDocument;
}

interface CachedTransformerDocument {
  readonly text: string;
  readonly methods: readonly TransformerMethod[];
}

export interface IndexedGramRule {
  readonly document: vscode.TextDocument;
  readonly rule: GramRuleDefinition;
  readonly source: string;
}

const IGNORED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "build",
  ".vscode-test",
]);

const isIgnoredUri = (uri: vscode.Uri): boolean =>
  uri.path.split("/").some((segment) => IGNORED_SEGMENTS.has(segment));

const isInlineGrammarUri = (uri: vscode.Uri): boolean =>
  uri.path.endsWith("/inlined_grammar.gram") || uri.path.endsWith("inlined_grammar.gram");

const isGrammarUri = (uri: vscode.Uri): boolean =>
  uri.path.endsWith(".gram") && !isInlineGrammarUri(uri) && !isIgnoredUri(uri);

const isTransformerUri = (uri: vscode.Uri): boolean =>
  /\/transform_[^/]+\.cpp$/u.test(uri.path) && !isIgnoredUri(uri);

const positionRange = (
  document: vscode.TextDocument,
  start: number,
  end: number,
): vscode.Range => new vscode.Range(document.positionAt(start), document.positionAt(end));

const pushLocation = (
  map: Map<string, vscode.Location[]>,
  key: string,
  location: vscode.Location,
): void => {
  const existing = map.get(key);
  if (existing) {
    existing.push(location);
    return;
  }
  map.set(key, [location]);
};

export class WorkspaceIndex {
  private readonly gramCache = new Map<string, CachedGramDocument>();
  private readonly transformerCache = new Map<string, CachedTransformerDocument>();

  public getParsedGramDocument(document: vscode.TextDocument): ParsedGramDocument {
    const text = document.getText();
    const cacheKey = document.uri.toString();
    const cached = this.gramCache.get(cacheKey);

    if (cached && cached.text === text) {
      return cached.parsed;
    }

    const parsed = parseGram(text);
    this.gramCache.set(cacheKey, { text, parsed });
    return parsed;
  }

  public getTransformerMethods(document: vscode.TextDocument): readonly TransformerMethod[] {
    const text = document.getText();
    const cacheKey = document.uri.toString();
    const cached = this.transformerCache.get(cacheKey);

    if (cached && cached.text === text) {
      return cached.methods;
    }

    const methods = parseTransformerMethods(text);
    this.transformerCache.set(cacheKey, { text, methods });
    return methods;
  }

  public findGrammarTokenAtOffset(
    document: vscode.TextDocument,
    offset: number,
  ): GramToken | undefined {
    const parsed = this.getParsedGramDocument(document);
    return findTokenAtOffset(parsed, offset) ?? (offset > 0 ? findTokenAtOffset(parsed, offset - 1) : undefined);
  }

  public findTransformerMethodAtOffset(
    document: vscode.TextDocument,
    offset: number,
  ): TransformerMethod | undefined {
    const methods = this.getTransformerMethods(document);
    return (
      findTransformerMethodAtOffset(methods, offset) ??
      (offset > 0 ? findTransformerMethodAtOffset(methods, offset - 1) : undefined)
    );
  }

  public async getAllRuleNames(extraDocuments: readonly vscode.TextDocument[] = []): Promise<readonly string[]> {
    const definitionMap = await this.getGrammarDefinitionMap(extraDocuments);
    return [...definitionMap.keys()].sort((left, right) => left.localeCompare(right));
  }

  public async getRuleDefinitions(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<vscode.Location[]> {
    const matches = await this.getRuleMatches(ruleName, extraDocuments);
    return matches.map(
      (match) =>
        new vscode.Location(
          match.document.uri,
          positionRange(match.document, match.rule.nameStart, match.rule.nameEnd),
        ),
    );
  }

  public async getRulePreviews(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<IndexedGramRule[]> {
    return this.getRuleMatches(ruleName, extraDocuments);
  }

  public async getTransformerLocations(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<vscode.Location[]> {
    const definitionMap = await this.getTransformerDefinitionMap(extraDocuments);
    return [...(definitionMap.get(ruleName) ?? [])];
  }

  public async getRuleReferences(
    ruleName: string,
    includeDeclaration: boolean,
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<vscode.Location[]> {
    const documents = await this.loadDocuments("**/*.gram", isGrammarUri, extraDocuments);
    const locations: vscode.Location[] = [];

    if (includeDeclaration) {
      locations.push(...(await this.getRuleDefinitions(ruleName, extraDocuments)));
    }

    for (const document of documents) {
      const parsed = this.getParsedGramDocument(document);
      for (const rule of parsed.rules) {
        for (const reference of rule.references) {
          if (reference.name !== ruleName) {
            continue;
          }
          locations.push(
            new vscode.Location(document.uri, positionRange(document, reference.start, reference.end)),
          );
        }
      }
    }

    return locations;
  }

  public async getGrammarDefinitionMap(
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<Map<string, vscode.Location[]>> {
    const documents = await this.loadGrammarDocuments(extraDocuments);
    const definitionMap = new Map<string, vscode.Location[]>();

    for (const document of documents) {
      const parsed = this.getParsedGramDocument(document);
      for (const rule of parsed.rules) {
        pushLocation(
          definitionMap,
          rule.name,
          new vscode.Location(document.uri, positionRange(document, rule.nameStart, rule.nameEnd)),
        );
      }
    }

    return definitionMap;
  }

  public async getTransformerDefinitionMap(
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<Map<string, vscode.Location[]>> {
    const documents = await this.loadDocuments("**/transform_*.cpp", isTransformerUri, extraDocuments);
    const definitionMap = new Map<string, vscode.Location[]>();

    for (const document of documents) {
      const methods = this.getTransformerMethods(document);
      for (const method of methods) {
        pushLocation(
          definitionMap,
          method.ruleName,
          new vscode.Location(document.uri, positionRange(document, method.nameStart, method.nameEnd)),
        );
      }
    }

    return definitionMap;
  }

  private async getRuleMatches(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[],
  ): Promise<IndexedGramRule[]> {
    const documents = await this.loadGrammarDocuments(extraDocuments);
    const matches: IndexedGramRule[] = [];

    for (const document of documents) {
      const text = document.getText();
      const parsed = this.getParsedGramDocument(document);

      for (const rule of parsed.rules) {
        if (rule.name !== ruleName) {
          continue;
        }

        matches.push({
          document,
          rule,
          source: getRuleSource(text, rule),
        });
      }
    }

    return matches;
  }

  private async loadGrammarDocuments(
    extraDocuments: readonly vscode.TextDocument[],
  ): Promise<vscode.TextDocument[]> {
    return this.loadDocuments("**/*.gram", isGrammarUri, extraDocuments);
  }

  private async loadDocuments(
    pattern: string,
    matcher: (uri: vscode.Uri) => boolean,
    extraDocuments: readonly vscode.TextDocument[],
  ): Promise<vscode.TextDocument[]> {
    const documentMap = new Map<string, vscode.TextDocument>();

    for (const document of extraDocuments) {
      if (matcher(document.uri)) {
        documentMap.set(document.uri.toString(), document);
      }
    }

    const uris = await vscode.workspace.findFiles(pattern);
    const documents = await Promise.all(
      uris.filter(matcher).map(async (uri) => {
        const key = uri.toString();
        if (documentMap.has(key)) {
          return undefined;
        }
        return vscode.workspace.openTextDocument(uri);
      }),
    );

    for (const document of documents) {
      if (!document) {
        continue;
      }
      documentMap.set(document.uri.toString(), document);
    }

    return [...documentMap.values()];
  }
}

export const isGrammarDocument = (document: vscode.TextDocument): boolean =>
  document.languageId === "duckdb-gram" || isGrammarUri(document.uri);

export const isTransformerDocument = (document: vscode.TextDocument): boolean =>
  document.languageId === "cpp" && isTransformerUri(document.uri);
