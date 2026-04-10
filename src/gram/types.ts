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

export enum GramExpressionKind {
  Literal = "literal",
  Reference = "reference",
  FunctionCall = "functionCall",
  Regex = "regex",
  Sequence = "sequence",
  Choice = "choice",
  Optional = "optional",
  ZeroOrMore = "zeroOrMore",
  OneOrMore = "oneOrMore",
  Group = "group",
  NegativeLookahead = "negativeLookahead",
}

interface GramExpressionBase {
  readonly kind: GramExpressionKind;
  readonly start: number;
  readonly end: number;
}

export interface GramLiteralExpression extends GramExpressionBase {
  readonly kind: GramExpressionKind.Literal;
  readonly text: string;
}

export interface GramRegexExpression extends GramExpressionBase {
  readonly kind: GramExpressionKind.Regex;
  readonly text: string;
}

export interface GramReferenceExpression extends GramExpressionBase {
  readonly kind: GramExpressionKind.Reference;
  readonly name: string;
  readonly rawName: string;
}

export interface GramFunctionCallExpression extends GramExpressionBase {
  readonly kind: GramExpressionKind.FunctionCall;
  readonly name: string;
  readonly rawName: string;
  readonly argument?: GramExpression;
}

export interface GramSequenceExpression extends GramExpressionBase {
  readonly kind: GramExpressionKind.Sequence;
  readonly elements: readonly GramExpression[];
}

export interface GramChoiceExpression extends GramExpressionBase {
  readonly kind: GramExpressionKind.Choice;
  readonly alternatives: readonly GramExpression[];
}

export interface GramWrappedExpression extends GramExpressionBase {
  readonly expression: GramExpression;
}

export interface GramOptionalExpression extends GramWrappedExpression {
  readonly kind: GramExpressionKind.Optional;
}

export interface GramZeroOrMoreExpression extends GramWrappedExpression {
  readonly kind: GramExpressionKind.ZeroOrMore;
}

export interface GramOneOrMoreExpression extends GramWrappedExpression {
  readonly kind: GramExpressionKind.OneOrMore;
}

export interface GramGroupExpression extends GramExpressionBase {
  readonly kind: GramExpressionKind.Group;
  readonly expression?: GramExpression;
}

export interface GramNegativeLookaheadExpression extends GramWrappedExpression {
  readonly kind: GramExpressionKind.NegativeLookahead;
}

export type GramExpression =
  | GramLiteralExpression
  | GramRegexExpression
  | GramReferenceExpression
  | GramFunctionCallExpression
  | GramSequenceExpression
  | GramChoiceExpression
  | GramOptionalExpression
  | GramZeroOrMoreExpression
  | GramOneOrMoreExpression
  | GramGroupExpression
  | GramNegativeLookaheadExpression;

export interface GramRuleChild {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly expression: GramExpression;
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
  readonly expression?: GramExpression;
  readonly children: readonly GramRuleChild[];
}

export interface ParsedGramDocument {
  readonly tokens: readonly GramToken[];
  readonly rules: readonly GramRuleDefinition[];
}

export interface TransformerMethod {
  readonly ruleName: string;
  readonly nameStart: number;
  readonly nameEnd: number;
  readonly bodyStart?: number;
  readonly bodyEnd?: number;
  readonly listResultVariables: readonly string[];
  readonly childAccesses: readonly TransformerChildAccess[];
}

export interface TransformerChildAccess {
  readonly childIndex: number;
  readonly start: number;
  readonly end: number;
  readonly variableName: string;
}
