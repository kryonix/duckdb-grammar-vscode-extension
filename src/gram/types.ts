export enum GramTokenType {
  RuleName = "ruleName",
  Separator = "separator",
  Literal = "literal",
  Reference = "reference",
  Operator = "operator",
  Choice = "choice",
  Quantifier = "quantifier",
  Comment = "comment",
  Regex = "regex",
  Parameter = "parameter",
  BadChar = "badChar",
  WhiteSpace = "whiteSpace",
}

export interface GramToken {
  readonly type: GramTokenType;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface GramReferenceOccurrence {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

export interface GramRuleDefinition {
  readonly name: string;
  readonly rawName: string;
  readonly parameter?: string;
  readonly nameStart: number;
  readonly nameEnd: number;
  readonly separatorStart: number;
  readonly separatorEnd: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly fullStart: number;
  readonly fullEnd: number;
  readonly references: readonly GramReferenceOccurrence[];
}

export interface ParsedGramDocument {
  readonly tokens: readonly GramToken[];
  readonly rules: readonly GramRuleDefinition[];
}

export interface TransformerMethod {
  readonly ruleName: string;
  readonly nameStart: number;
  readonly nameEnd: number;
}
