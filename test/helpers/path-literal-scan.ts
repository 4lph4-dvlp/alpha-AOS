// This module is NOT a test. It lives under `test/helpers` because
// `run-tests.mjs` enumerates only files directly under `dist/test`, so helper
// modules in `dist/test/helpers` are never mistaken for suites.

import ts from "typescript";

/** A drive-letter root, a UNC root, or a POSIX system root on a whole leading segment. */
export const ABSOLUTE_PATH_LITERAL = /^(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|root|tmp|var|private|opt|usr|etc|mnt|Volumes|bin)(?:\/|$))/u;

export const HOST_PATH_FUNCTIONS: ReadonlySet<string> = new Set(["join", "resolve", "normalize", "relative", "dirname", "basename"]);

/** The exemption marker must carry a reason of at least four characters. */
export const PATH_LITERAL_MARKER = /\/\/\s*path-literal-ok:\s*\S.{2,}\S/u;

export interface PathLiteralViolation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly literal: string;
  readonly via: string;
}

type PathLiteralNode = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression;

function absoluteLiteralText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return ABSOLUTE_PATH_LITERAL.test(node.text) ? node.text : undefined;
  }
  if (ts.isTemplateExpression(node)) {
    return ABSOLUTE_PATH_LITERAL.test(node.head.text) ? node.head.text : undefined;
  }
  return undefined;
}

function isHostPathCall(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return HOST_PATH_FUNCTIONS.has(callee.text);
  return ts.isPropertyAccessExpression(callee)
    && ts.isIdentifier(callee.expression)
    && callee.expression.text === "path"
    && HOST_PATH_FUNCTIONS.has(callee.name.text);
}

function visitAll(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => visitAll(child, visit));
}

export function scanPathLiterals(fileName: string, text: string): PathLiteralViolation[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const lines = text.split(/\r?\n/u);

  // Bindings resolve by name across the whole file, not by scope: a shadowing
  // name can only add a violation (fail closed), never hide one.
  const bindings = new Map<string, PathLiteralNode[]>();
  visitAll(source, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    if (!ts.isVariableDeclarationList(node.parent) || (node.parent.flags & ts.NodeFlags.Const) === 0) return;
    const initializer = node.initializer;
    if (!ts.isStringLiteral(initializer) && !ts.isNoSubstitutionTemplateLiteral(initializer)) return;
    if (absoluteLiteralText(initializer) === undefined) return;
    const bound = bindings.get(node.name.text) ?? [];
    bound.push(initializer);
    bindings.set(node.name.text, bound);
  });

  const reported = new Set<ts.Node>();
  const violations: PathLiteralViolation[] = [];
  const report = (literalNode: PathLiteralNode, via: string): void => {
    if (reported.has(literalNode)) return;
    reported.add(literalNode);
    const literal = absoluteLiteralText(literalNode);
    if (literal === undefined) return;
    const position = source.getLineAndCharacterOfPosition(literalNode.getStart(source));
    if (PATH_LITERAL_MARKER.test(lines[position.line] ?? "")) return;
    violations.push({ file: fileName, line: position.line + 1, column: position.character + 1, literal, via });
  };

  visitAll(source, (node) => {
    if (!ts.isCallExpression(node) || !isHostPathCall(node)) return;
    for (const argument of node.arguments) {
      if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument) || ts.isTemplateExpression(argument)) {
        if (absoluteLiteralText(argument) !== undefined) report(argument, "direct host-path argument");
      } else if (ts.isIdentifier(argument)) {
        for (const literalNode of bindings.get(argument.text) ?? []) report(literalNode, `binding ${argument.text}`);
      }
    }
  });

  return violations.sort((left, right) => {
    if (left.file !== right.file) return left.file < right.file ? -1 : 1;
    if (left.line !== right.line) return left.line - right.line;
    return left.column - right.column;
  });
}

export function formatPathLiteralViolation(violation: PathLiteralViolation): string {
  return `${violation.file}:${violation.line}:${violation.column} ${JSON.stringify(violation.literal)} via ${violation.via}`;
}
