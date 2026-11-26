import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const sourceFiles = ['index.ts', 'engineering-cli.ts', 'repair-cli.ts', 'github-host.ts', 'diagnostics-cli.ts'];
const sorted = values => [...new Set(values)].sort();
function walk(node, visit) { visit(node); ts.forEachChild(node, child => walk(child, visit)); }
function strings(node) {
  if (!ts.isArrayLiteralExpression(node) || !node.elements.every(ts.isStringLiteral)) throw new Error('CLI array shape changed; review reference extraction');
  return node.elements.map(element => element.text);
}
function arrayDeclaration(source, name) {
  let found;
  walk(source, node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      if (found) throw new Error(`Ambiguous CLI declaration: ${name}`);
      found = strings(node.initializer);
    }
  });
  if (!found) throw new Error(`Missing CLI declaration: ${name}`);
  return found;
}
function functionNode(source, name) {
  let found;
  walk(source, node => { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; });
  if (!found) throw new Error(`Missing CLI function: ${name}`);
  return found;
}
function includesArray(scope, required) {
  const found = [];
  walk(scope, node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'includes' && ts.isArrayLiteralExpression(node.expression.expression)) {
      if (!node.expression.expression.elements.every(ts.isStringLiteral)) return;
      const values = strings(node.expression.expression);
      if (values.includes(required)) found.push(values);
    }
  });
  if (found.length !== 1) throw new Error(`CLI command array changed: ${required}`);
  return found[0];
}
function indexOptions(source, label) {
  let result;
  walk(source, node => {
    if (!ts.isCaseClause(node) || !ts.isStringLiteral(node.expression) || node.expression.text !== label) return;
    walk(node, call => {
      if (ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === 'rejectUnknown') {
        if (result) throw new Error(`Ambiguous rejectUnknown in ${label}`);
        result = [...strings(call.arguments[1]), ...(call.arguments[2] ? strings(call.arguments[2]) : [])];
      }
    });
  });
  if (!result) throw new Error(`Missing CLI option parser: ${label}`);
  return result;
}
function diagnosticOptions(source, action) {
  let scope = source;
  if (action === 'run' || action === 'report') {
    let found;
    walk(source, node => {
      if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression) && ts.isIdentifier(node.expression.left) && node.expression.left.text === 'action' && ts.isStringLiteral(node.expression.right) && node.expression.right.text === action) found = node.thenStatement;
    });
    if (!found) throw new Error(`Missing diagnostic action: ${action}`);
    scope = found;
  }
  const found = [];
  walk(scope, node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'allowed' && ts.isArrayLiteralExpression(node.arguments[1])) {
      const values = strings(node.arguments[1]);
      if (action !== 'inspect' || values.includes('--id')) found.push(values);
    }
  });
  if (found.length !== 1) throw new Error(`Diagnostic parser changed: ${action}`);
  return found[0];
}
/** Reads TypeScript syntax only. Never imports the CLI, accesses host state or invokes commands. */
export async function readCliInventory(overrides = {}) {
  const sources = {};
  for (const filename of sourceFiles) {
    const content = overrides[filename] ?? await readFile(path.join(root, 'apps/cli/src', filename), 'utf8');
    sources[filename] = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
    assert.equal(sources[filename].parseDiagnostics.length, 0, `Invalid TypeScript source: ${filename}`);
  }
  const main = sources['index.ts'], engineering = sources['engineering-cli.ts'], repair = sources['repair-cli.ts'];
  const commands = [];
  walk(functionNode(main, 'main'), node => { if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) commands.push(node.expression.text); });
  // These commands are handled before the main switch; verify those literals still exist.
  const mainText = main.getText();
  for (const command of ['version', 'help', 'eval', 'metrics', 'trace']) {
    if (!mainText.includes(`"${command}"`)) throw new Error(`Missing early command: ${command}`);
    commands.push(command);
  }
  const authNode = functionNode(sources['github-host.ts'], 'authCommand');
  const auth = includesArray(authNode, 'login');
  const authFlags = [];
  walk(authNode, node => { if (ts.isStringLiteral(node) && node.text.startsWith('--')) authFlags.push(node.text); });
  const lifecycle = arrayDeclaration(engineering, 'allowed');
  const repairs = includesArray(functionNode(repair, 'repairCommand'), 'repair-history');
  const diagnostic = sources['diagnostics-cli.ts'];
  const evaluationActions = [];
  walk(diagnostic, node => {
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.left.text === 'action' && ts.isStringLiteral(node.right)) evaluationActions.push(`eval ${node.right.text}`);
  });
  const options = {
    init: indexOptions(main, 'init'), doctor: indexOptions(main, 'doctor'), agents: indexOptions(main, 'agents'), config: indexOptions(main, 'config'),
    run: indexOptions(main, 'run'), status: indexOptions(main, 'status'), auth: authFlags,
    implement: [...arrayDeclaration(engineering, 'valued'), ...arrayDeclaration(engineering, 'flags')],
    lifecycle: ['--id', '--json'], validate: ['--id', '--json', '--profile', '--action'],
    repair: [...arrayDeclaration(repair, 'values'), ...arrayDeclaration(repair, 'flags')],
    'repair-inspect': includesArray(functionNode(repair, 'repairCommand'), '--id'),
    'eval-run': diagnosticOptions(diagnostic, 'run'), 'eval-report': diagnosticOptions(diagnostic, 'report'), diagnostics: diagnosticOptions(diagnostic, 'inspect'),
  };
  // Lifecycle uses a dynamic spread. Fail closed if that reviewed parser shape changes.
  const lifecycleText = functionNode(engineering, 'engineeringLifecycleCommand').getText();
  assert.match(lifecycleText, /\["--id", "--json", \.\.\.\(command === "validate" \? \["--profile", "--action"\] : \[\]\)\]/, 'Lifecycle option gate changed; review documentation');
    return {
    commands: sorted([...commands.filter(c => !['auth', 'engineering', 'eval'].includes(c)), ...auth.map(c => `auth ${c}`), ...lifecycle.map(c => `engineering ${c}`), ...repairs.map(c => `engineering ${c}`), ...evaluationActions]),
    options: Object.fromEntries(Object.entries(options).map(([key, values]) => [key, sorted(values)])),
  };
}
export function validateCliReference(markdown, inventory) {
  const commands = [...markdown.matchAll(/<!-- cli-command: ([a-z -]+) -->/g)].map(match => match[1]);
  assert.deepEqual(sorted(commands), inventory.commands, 'Documented commands differ from CLI parsers');
  assert.equal(commands.length, sorted(commands).length, 'Duplicate command coverage marker');
  const scopes = [];
  for (const [scope, expected] of Object.entries(inventory.options)) {
    const start = `<!-- cli-options: ${scope} -->`, end = '<!-- /cli-options -->';
    const from = markdown.indexOf(start), to = markdown.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `Missing CLI option table: ${scope}`);
    const actual = sorted([...markdown.slice(from + start.length, to).matchAll(/`(--[a-z-]+)`/g)].map(match => match[1]));
    assert.deepEqual(actual, expected, `CLI option drift: ${scope}`);
    scopes.push(scope);
  }
  const markers = [...markdown.matchAll(/<!-- cli-options: ([a-z-]+) -->/g)].map(match => match[1]);
  assert.deepEqual(sorted(markers), sorted(scopes), 'Unexpected CLI option scope');
  assert.equal(markers.length, scopes.length, 'Duplicate CLI option scope');
  return { commands: commands.length, optionScopes: scopes.length };
}
export async function checkCliReference() {
  const markdown = await readFile(path.join(root, 'apps/docs/reference/cli.md'), 'utf8');
  return validateCliReference(markdown, await readCliInventory());
}
async function selfTest() {
  const markdown = await readFile(path.join(root, 'apps/docs/reference/cli.md'), 'utf8');
  const inventory = await readCliInventory();
  validateCliReference(markdown, inventory);
  assert.throws(() => validateCliReference(markdown.replace('`--dry-run`', '`--invented-option`'), inventory), /CLI option drift/);
  const source = await readFile(path.join(root, 'apps/cli/src/repair-cli.ts'), 'utf8');
  const changed = await readCliInventory({ 'repair-cli.ts': source.replace('const flags = [', 'const flags = ["--new-option", ') });
  assert.throws(() => validateCliReference(markdown, changed), /CLI option drift: repair/);
  const main = await readFile(path.join(root, 'apps/cli/src/index.ts'), 'utf8');
  const added = await readCliInventory({ 'index.ts': main.replace('case "init":', 'case "new-command":\n      case "init":') });
  assert.throws(() => validateCliReference(markdown, added), /Documented commands differ/);
  console.log('CLI drift tests: 4 passed (baseline, missing/invented option, new parser option, new command)');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--test')) await selfTest();
    else console.log('CLI reference verified:', await checkCliReference());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
