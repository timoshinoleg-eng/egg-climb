import ts from 'typescript'

const ALLOWED_EXTERNAL_IMPORT = '@dimforge/rapier3d-deterministic-compat'
const ALLOWED_MATH_MEMBERS = new Set(['abs', 'min', 'max', 'floor', 'sign', 'sqrt', 'fround', 'imul'])
const BANNED_GLOBALS = new Set([
  'Date',
  'performance',
  'crypto',
  'structuredClone',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'fetch',
  'navigator',
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'WebSocket',
])

function lineAndColumn(sourceFile, node) {
  const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${point.line + 1}:${point.character + 1}`
}

function isPropertyNameIdentifier(node) {
  const parent = node.parent
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node)
  )
}

export function findSimDeterminismViolations(sourceText, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const violations = []

  function report(node, message) {
    violations.push(`${fileName}:${lineAndColumn(sourceFile, node)} ${message}`)
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text
      if (!specifier.startsWith('.')) {
        const isRapierImport = specifier === ALLOWED_EXTERNAL_IMPORT && fileName.replaceAll('\\', '/').endsWith('/sim/rapier.ts')
        if (!isRapierImport) report(node.moduleSpecifier, `external import is not allowed in authoritative sim: ${specifier}`)
      }
    }

    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken) report(node.operatorToken, 'exponentiation operator ** is not allowed in authoritative sim')
      if (node.operatorToken.kind === ts.SyntaxKind.PercentToken) report(node.operatorToken, 'remainder operator % is not allowed in authoritative sim')
    }

    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Math') {
      if (!ALLOWED_MATH_MEMBERS.has(node.name.text)) report(node, `Math.${node.name.text} is not on the deterministic allowlist`)
    }

    if (ts.isIdentifier(node) && BANNED_GLOBALS.has(node.text) && !isPropertyNameIdentifier(node)) {
      report(node, `ambient/environmental global is not allowed in authoritative sim: ${node.text}`)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

export const SIM_DETERMINISM_POLICY = Object.freeze({
  allowedExternalImport: ALLOWED_EXTERNAL_IMPORT,
  allowedMathMembers: Object.freeze([...ALLOWED_MATH_MEMBERS].sort()),
  bannedGlobals: Object.freeze([...BANNED_GLOBALS].sort()),
})
