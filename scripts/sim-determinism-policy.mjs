import path from 'node:path'
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
  'globalThis',
  'self',
  'Reflect',
  'Proxy',
  'WebAssembly',
  'Atomics',
  'SharedArrayBuffer',
  'process',
  'require',
  'eval',
  'Function',
  'Intl',
])

function lineAndColumn(sourceFile, node) {
  const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${point.line + 1}:${point.character + 1}`
}

function normalizedFileName(fileName) {
  return fileName.replaceAll('\\', '/')
}

function relativeImportStaysInsideSim(fileName, specifier) {
  const from = path.posix.dirname(normalizedFileName(fileName))
  const target = path.posix.normalize(path.posix.join(from, specifier))
  return target === 'src/sim' || target.startsWith('src/sim/')
}

function relativeImportStaysInsideAuthoritativeHost(fileName, specifier) {
  const from = path.posix.dirname(normalizedFileName(fileName))
  const target = path.posix.normalize(path.posix.join(from, specifier))
  return target === 'src/host' || target.startsWith('src/host/') || target === 'src/sim' || target.startsWith('src/sim/')
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

function checkModuleSpecifier(moduleSpecifier, fileName, report, allowedRelative, allowRapier) {
  const specifier = moduleSpecifier.text
  if (specifier.startsWith('.')) {
    if (!allowedRelative(fileName, specifier)) report(moduleSpecifier, `relative import escapes authoritative boundary: ${specifier}`)
    return
  }
  const isRapierImport = allowRapier && specifier === ALLOWED_EXTERNAL_IMPORT && normalizedFileName(fileName).endsWith('/sim/rapier.ts')
  if (!isRapierImport) report(moduleSpecifier, `external import is not allowed in authoritative code: ${specifier}`)
}

function collectViolations(sourceText, fileName, options) {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const violations = []

  function report(node, message) {
    violations.push(`${fileName}:${lineAndColumn(sourceFile, node)} ${message}`)
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      checkModuleSpecifier(node.moduleSpecifier, fileName, report, options.allowedRelative, options.allowRapier)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      checkModuleSpecifier(node.moduleSpecifier, fileName, report, options.allowedRelative, options.allowRapier)
    }
    if (ts.isImportEqualsDeclaration(node)) report(node, 'import-equals is not allowed in authoritative code')
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) report(node, 'dynamic import() is not allowed in authoritative code')
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) report(node, 'import.meta is not allowed in authoritative code')

    if (options.strictMath && ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken) report(node.operatorToken, 'exponentiation operator ** is not allowed in authoritative sim')
      if (node.operatorToken.kind === ts.SyntaxKind.PercentToken) report(node.operatorToken, 'remainder operator % is not allowed in authoritative sim')
    }

    if (options.strictMath && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Math') {
      if (!ALLOWED_MATH_MEMBERS.has(node.name.text)) report(node, `Math.${node.name.text} is not on the deterministic allowlist`)
    }
    if (ts.isIdentifier(node) && node.text === 'Math') {
      const parent = node.parent
      const directPropertyAccess = ts.isPropertyAccessExpression(parent) && parent.expression === node
      if (!directPropertyAccess || !options.strictMath) report(node, options.strictMath ? 'Math may only be used through a direct allowlisted Math.member access' : 'Math is not allowed in authoritative worker runtime')
    }

    if (ts.isIdentifier(node) && BANNED_GLOBALS.has(node.text) && !isPropertyNameIdentifier(node)) {
      report(node, `ambient/environmental global is not allowed in authoritative code: ${node.text}`)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

export function findSimDeterminismViolations(sourceText, fileName = 'source.ts') {
  return collectViolations(sourceText, fileName, {
    allowedRelative: relativeImportStaysInsideSim,
    allowRapier: true,
    strictMath: true,
  })
}

export function findAuthoritativeHostViolations(sourceText, fileName = 'src/host/worker-runtime.ts') {
  return collectViolations(sourceText, fileName, {
    allowedRelative: relativeImportStaysInsideAuthoritativeHost,
    allowRapier: false,
    strictMath: false,
  })
}

export const SIM_DETERMINISM_POLICY = Object.freeze({
  allowedExternalImport: ALLOWED_EXTERNAL_IMPORT,
  allowedMathMembers: Object.freeze([...ALLOWED_MATH_MEMBERS].sort()),
  bannedGlobals: Object.freeze([...BANNED_GLOBALS].sort()),
})
