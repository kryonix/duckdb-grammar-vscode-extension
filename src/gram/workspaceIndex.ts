import * as vscode from "vscode";
import {
  buildKeywordRuleSource,
  getKeywordRuleNameFromPath,
  isKeywordBackedRuleName,
  parseKeywordListEntries,
} from "./keywords";
import {
  getExpressionDisplayText,
  getExpressionParseResultDescription,
} from "./expression";
import { findTokenAtOffset, parseGram } from "./parser";
import { getRuleSource } from "./preview";
import {
  findTransformerChildAccessAtOffset,
  findTransformerMethodAtOffset,
  parseTransformerMethods,
} from "./transformer";
import {
  GramRuleDefinition,
  GramToken,
  ParsedGramDocument,
  TransformerMethod,
} from "./types";

interface CachedGramDocument {
  readonly text: string;
  readonly parsed: ParsedGramDocument;
}

interface CachedTransformerDocument {
  readonly text: string;
  readonly methods: readonly TransformerMethod[];
}

export interface IndexedRuleMatch {
  readonly document: vscode.TextDocument;
  readonly name: string;
  readonly nameStart: number;
  readonly nameEnd: number;
  readonly source: string;
}

export interface IndexedRuleChildMatch {
  readonly document: vscode.TextDocument;
  readonly ruleName: string;
  readonly childIndex: number;
  readonly childCount: number;
  readonly childSource: string;
  readonly childResultDescription: string;
  readonly source: string;
}

export interface TransformerChildAccessMatch {
  readonly method: TransformerMethod;
  readonly childIndex: number;
  readonly start: number;
  readonly end: number;
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

const isInlineGrammarDocumentUri = (uri: vscode.Uri): boolean =>
  isInlineGrammarUri(uri) && !isIgnoredUri(uri);

const isGrammarDocumentUri = (uri: vscode.Uri): boolean =>
  uri.path.endsWith(".gram") && !isIgnoredUri(uri);

const isGrammarWorkspaceUri = (uri: vscode.Uri): boolean =>
  isGrammarDocumentUri(uri) && !isInlineGrammarUri(uri);

const isTransformerUri = (uri: vscode.Uri): boolean =>
  /\/transform_[^/]+\.cpp$/u.test(uri.path) && !isIgnoredUri(uri);

const isKeywordRuleUri = (uri: vscode.Uri): boolean =>
  !isIgnoredUri(uri) && getKeywordRuleNameFromPath(uri.path) !== undefined;

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

const createRuleMatchKey = (match: IndexedRuleMatch): string =>
  `${match.document.uri.toString()}::${match.nameStart}::${match.nameEnd}`;

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

  public findTransformerChildAccessAtOffset(
    document: vscode.TextDocument,
    offset: number,
  ): TransformerChildAccessMatch | undefined {
    const methods = this.getTransformerMethods(document);
    const match =
      findTransformerChildAccessAtOffset(methods, offset) ??
      (offset > 0 ? findTransformerChildAccessAtOffset(methods, offset - 1) : undefined);

    if (!match) {
      return undefined;
    }

    return {
      method: match.method,
      childIndex: match.access.childIndex,
      start: match.access.start,
      end: match.access.end,
    };
  }

  public async getAllRuleNames(extraDocuments: readonly vscode.TextDocument[] = []): Promise<readonly string[]> {
    const definitionMap = await this.getGrammarDefinitionMap(extraDocuments);
    const names = new Set(definitionMap.keys());

    for (const match of await this.getKeywordRuleMatches()) {
      names.add(match.name);
    }

    return [...names].sort((left, right) => left.localeCompare(right));
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
          positionRange(match.document, match.nameStart, match.nameEnd),
        ),
    );
  }

  public async getRulePreviews(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<IndexedRuleMatch[]> {
    return this.getRuleMatches(ruleName, extraDocuments);
  }

  public async getRuleChildMatches(
    ruleName: string,
    childIndex: number,
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<IndexedRuleChildMatch[]> {
    const matches = await this.getParsedRuleMatches(ruleName, extraDocuments);

    return matches.flatMap(({ document, rule, source, text }) => {
      const child = rule.children[childIndex];
      if (!child) {
        return [];
      }

      return [
        {
          document,
          ruleName: rule.name,
          childIndex,
          childCount: rule.children.length,
          childSource: getExpressionDisplayText(text, child.expression),
          childResultDescription: getExpressionParseResultDescription(child.expression),
          source,
        },
      ];
    });
  }

  public async getRuleChildCount(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[] = [],
  ): Promise<number | undefined> {
    const matches = await this.getParsedRuleMatches(ruleName, extraDocuments);
    return matches[0]?.rule.children.length;
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
    const documents = await this.loadGrammarDocuments(extraDocuments);
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
  ): Promise<IndexedRuleMatch[]> {
    const matches = await this.getGrammarRuleMatches(ruleName, extraDocuments);

    if (isKeywordBackedRuleName(ruleName)) {
      matches.push(...(await this.getInlineGrammarRuleMatches(ruleName, extraDocuments)));
      matches.push(...(await this.getKeywordRuleMatches(ruleName)));
    }

    const uniqueMatches = new Map<string, IndexedRuleMatch>();
    for (const match of matches) {
      uniqueMatches.set(createRuleMatchKey(match), match);
    }

    return [...uniqueMatches.values()];
  }

  private async getGrammarRuleMatches(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[],
  ): Promise<IndexedRuleMatch[]> {
    const documents = await this.loadGrammarDocuments(extraDocuments);
    const matches: IndexedRuleMatch[] = [];

    for (const document of documents) {
      const text = document.getText();
      const parsed = this.getParsedGramDocument(document);

      for (const rule of parsed.rules) {
        if (rule.name !== ruleName) {
          continue;
        }

        matches.push({
          document,
          name: rule.name,
          nameStart: rule.nameStart,
          nameEnd: rule.nameEnd,
          source: getRuleSource(text, rule),
        });
      }
    }

    return matches;
  }

  private async getParsedRuleMatches(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[],
  ): Promise<
    Array<{
      document: vscode.TextDocument;
      rule: GramRuleDefinition;
      source: string;
      text: string;
    }>
  > {
    const grammarMatches = await this.collectParsedRuleMatches(
      await this.loadGrammarDocuments(extraDocuments),
      ruleName,
    );
    if (grammarMatches.length > 0) {
      return grammarMatches;
    }

    return this.collectParsedRuleMatches(
      await this.loadInlineGrammarDocuments(extraDocuments),
      ruleName,
    );
  }

  private async collectParsedRuleMatches(
    documents: readonly vscode.TextDocument[],
    ruleName: string,
  ): Promise<
    Array<{
      document: vscode.TextDocument;
      rule: GramRuleDefinition;
      source: string;
      text: string;
    }>
  > {
    const matches: Array<{
      document: vscode.TextDocument;
      rule: GramRuleDefinition;
      source: string;
      text: string;
    }> = [];

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
          text,
        });
      }
    }

    return matches;
  }

  private async getKeywordRuleMatches(ruleName?: string): Promise<IndexedRuleMatch[]> {
    const documents = await this.loadDocuments("**/grammar/keywords/*.list", isKeywordRuleUri, []);
    const matches: IndexedRuleMatch[] = [];

    for (const document of documents) {
      const resolvedRuleName = getKeywordRuleNameFromPath(document.uri.path);
      if (!resolvedRuleName || (ruleName && resolvedRuleName !== ruleName)) {
        continue;
      }

      const entries = parseKeywordListEntries(document.getText());
      const firstLine = document.lineCount > 0 ? document.lineAt(0) : undefined;
      const nameStart = firstLine ? document.offsetAt(firstLine.range.start) : 0;
      const nameEnd = firstLine ? document.offsetAt(firstLine.range.end) : 0;

      matches.push({
        document,
        name: resolvedRuleName,
        nameStart,
        nameEnd,
        source: buildKeywordRuleSource(resolvedRuleName, entries),
      });
    }

    return matches;
  }

  private async getInlineGrammarRuleMatches(
    ruleName: string,
    extraDocuments: readonly vscode.TextDocument[],
  ): Promise<IndexedRuleMatch[]> {
    const documents = await this.loadInlineGrammarDocuments(extraDocuments);
    const matches: IndexedRuleMatch[] = [];

    for (const document of documents) {
      const text = document.getText();
      const parsed = this.getParsedGramDocument(document);

      for (const rule of parsed.rules) {
        if (rule.name !== ruleName) {
          continue;
        }

        matches.push({
          document,
          name: rule.name,
          nameStart: rule.nameStart,
          nameEnd: rule.nameEnd,
          source: getRuleSource(text, rule),
        });
      }
    }

    return matches;
  }

  private async loadGrammarDocuments(
    extraDocuments: readonly vscode.TextDocument[],
  ): Promise<vscode.TextDocument[]> {
    const documentMap = new Map<string, vscode.TextDocument>();

    for (const document of extraDocuments) {
      if (isGrammarDocument(document)) {
        documentMap.set(document.uri.toString(), document);
      }
    }

    const workspaceDocuments = await this.loadDocuments("**/*.gram", isGrammarWorkspaceUri, []);
    for (const document of workspaceDocuments) {
      documentMap.set(document.uri.toString(), document);
    }

    return [...documentMap.values()];
  }

  private async loadInlineGrammarDocuments(
    extraDocuments: readonly vscode.TextDocument[],
  ): Promise<vscode.TextDocument[]> {
    const documentMap = new Map<string, vscode.TextDocument>();

    for (const document of extraDocuments) {
      if (isInlineGrammarDocumentUri(document.uri)) {
        documentMap.set(document.uri.toString(), document);
      }
    }

    const workspaceDocuments = await this.loadDocuments(
      "**/inlined_grammar.gram",
      isInlineGrammarDocumentUri,
      [],
    );
    for (const document of workspaceDocuments) {
      documentMap.set(document.uri.toString(), document);
    }

    return [...documentMap.values()];
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
  document.languageId === "duckdb-gram" || isGrammarDocumentUri(document.uri);

export const isTransformerDocument = (document: vscode.TextDocument): boolean =>
  document.languageId === "cpp" && isTransformerUri(document.uri);
