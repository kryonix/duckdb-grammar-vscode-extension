# DuckDB Grammar Support for VS Code

A VS Code extension for [DuckDB](https://duckdb.org/)'s PEG grammar files (`.gram`), built to mirror the CLion extension as closely as VS Code APIs allow.

## Features

- **Syntax highlighting** for rule names, separators (`<-`), literals, references, operators, choices, quantifiers, regex patterns, parameters, and comments
- **Go to Definition** for grammar rule references across workspace `.gram` files
- **Find References** for grammar rules across the workspace
- **Hover previews** on grammar rule references and `Transform<Rule>` methods to show the matching grammar rule body
- **Keyword-backed rule resolution** for pseudo-rules like `UnreservedKeyword`, with both `grammar/keywords/*.list` and `inlined_grammar.gram` exposed when available
- **Grammar → Transformer navigation** with CodeLens on grammar rules that have matching `PEGTransformerFactory::Transform<Rule>` methods in `transform_*.cpp`
- **Transformer → Grammar navigation** with CodeLens and `Go to Definition` on matching `Transform<Rule>` methods
- **Outline / Document Symbols** listing all grammar rules in the current file
- **Code folding** for multi-line rule bodies
- **Comment toggling** with `#` line comments
- **Rule name completions** sourced from workspace grammar files

## Building from Source

```bash
npm install
npm run compile
npm test
```

To run the extension in a VS Code Extension Development Host:

1. Open this repository in VS Code.
2. Press `F5`.

## Usage

- Open a `.gram` file to activate the language support.
- Hover a grammar rule reference or matching `Transform<Rule>` method to preview the corresponding grammar rule.
- Use `F12` or `Cmd+Click` on a rule reference to jump to its definition.
- Use `Shift+F12` on a rule definition or reference to find usages.
- Use the **Outline** view to browse rule definitions in the current file.
- Use the CodeLens links above grammar rules and transformer methods to jump between `.gram` and `transform_*.cpp` files.
- For keyword-backed pseudo-rules, VS Code will surface multiple definitions when both the generated `inlined_grammar.gram` rule and the source `grammar/keywords/*.list` file are present, so you can choose either target.

## Parity Notes

- VS Code does not expose JetBrains-style custom gutter icons for this workflow, so grammar/C++ navigation is implemented with **CodeLens**.
- VS Code folding uses standard line-based folding ranges and does not support CLion's custom folding placeholder text.
- `inlined_grammar.gram` remains excluded from general workspace indexing to avoid duplicate generated definitions, but keyword-backed pseudo-rules intentionally surface both generated and source-list targets.
