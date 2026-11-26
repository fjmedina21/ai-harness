import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOutput, checkNavigation, resolveLocal, publicationErrors } from './check.mjs';
const html = body => `<main>${body}</main>`;
test('nested Pages routes resolve assets, fragments and query strings under base', () => {
  const files = new Map([
    ['index.html', html('<a href="/ai-harness/guide/start.html#run">Start</a>')],
    ['guide/start.html', html('<h2 id="run">Run</h2><img alt="Diagram" src="../logo.svg"><a href="../index.html?v=1">Home</a>')],
    ['logo.svg', '<svg/>'],
  ]);
  assert.deepEqual(checkOutput(files).errors, []);
  assert.equal(resolveLocal('guide/start.html','#run').file, 'guide/start.html');
});
test('missing page, fragment and asset fail independently', () => {
  const result = checkOutput(new Map([['index.html', html('<a href="lost.html">Lost</a><a href="#missing">Anchor</a><img alt="x" src="logo.svg">')]]));
  assert.equal(result.errors.length, 3);
});
test('wrong base and remote render dependencies fail closed', () => {
  assert.throws(() => resolveLocal('index.html','/assets/x.js'), /Outside/);
  const errors = checkOutput(new Map([['index.html',html('<script src="https://cdn.example/app.js"></script><img src="/x.svg">')]])).errors;
  assert.ok(errors.some(e => e.includes('remote render')));
  assert.ok(errors.some(e => e.includes('alternative')));
});
test('navigation catches dead, duplicate and orphan pages', () => {
  const errors = checkNavigation([{ id:'guide', text:'Guide', items:[{text:'Lost',link:'/guide/lost'},{text:'Again',link:'/guide/lost'}] }],new Set(['index.md','guide/orphan.md']));
  assert.ok(errors.some(e => e.includes('Missing navigation')));
  assert.ok(errors.some(e => e.includes('Duplicate')));
  assert.ok(errors.some(e => e.includes('Unreachable')));
});
test('publication boundary catches private paths without fixtures on disk', () => {
  assert.equal(publicationErrors('page','/Users/example/private').length,1);
  assert.equal(publicationErrors('page','harness-development/private/evidence.json').length,1);
  assert.deepEqual(publicationErrors('page','OPENAI_API_KEY is supplied by the host.'),[]);
});
test('CSS dependency paths are checked relative to emitted stylesheet', () => {
  assert.deepEqual(checkOutput(new Map([['assets/style.css','@font-face{src:url(./font.woff2)}'],['assets/font.woff2','binary']])).errors,[]);
  assert.match(checkOutput(new Map([['assets/style.css','a{background:url(./missing.svg)}']])).errors[0],/missing CSS asset/);
});

test('case-insensitive remote URLs, all attribute quoting and CSS imports are checked', () => {
  const errors = checkOutput(new Map([
    ['index.html', html('<script src="HTTP://cdn.example/a.js"></script><a href=missing.html>Missing</a><a href=\'also-missing.html\'>Missing</a>')],
    ['assets/style.css', '@import "https://example.com/a.css";'],
  ])).errors;
  assert.equal(errors.length, 4);
  assert.ok(errors.some(e => e.includes('remote render')));
  assert.ok(errors.some(e => e.includes('remote CSS')));
});
