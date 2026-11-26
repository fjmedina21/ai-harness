import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const site = path.join(root, 'apps/docs');
export const base = '/ai-harness/';
const decode = value => value.replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
export async function filesBelow(dir, excluded = new Set()) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink excluded: ${path.relative(root, absolute)}`);
    if (entry.isDirectory()) result.push(...await filesBelow(absolute, excluded));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}
export function resolveLocal(from, target) {
  if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(target)) return null;
  const url = new URL(decode(target), `https://docs.invalid${base}${from}`);
  if (!url.pathname.startsWith(base)) throw new Error(`Outside configured base: ${target}`);
  const relative = decodeURIComponent(url.pathname.slice(base.length));
  const file = relative.endsWith('/') || !relative ? `${relative}index.html` : relative;
  return { file, fragment: decodeURIComponent(url.hash.slice(1)) };
}
export function checkOutput(output) {
  const errors = [];
  let links = 0, assets = 0, pages = 0;
  for (const [name, html] of output) {
    if (!name.endsWith('.html')) continue;
    pages++;
    const attrs = [...html.matchAll(/\b(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)];
    for (const [, rawAttr, doubleQuoted, singleQuoted, unquoted] of attrs) {
      const attr = rawAttr.toLowerCase();
      const value = doubleQuoted ?? singleQuoted ?? unquoted;
      const targets = attr === 'srcset' ? value.split(',').map(v => v.trim().split(/\s+/)[0]) : [value];
      for (const target of targets) {
        if (!target) continue;
        if (/^javascript:/i.test(target)) { errors.push(`${name}: executable URL`); continue; }
        if (attr !== 'href' && /^(?:https?:)?\/\//i.test(target)) { errors.push(`${name}: remote render dependency ${target}`); continue; }
        let local;
        try { local = resolveLocal(name, target); } catch (e) { errors.push(`${name}: ${e.message}`); continue; }
        if (!local) continue;
        links++;
        // VitePress emits extensionless navigation only when cleanUrls is enabled; ours is false.
        if (!output.has(local.file)) { errors.push(`${name}: missing ${local.file}`); continue; }
        if (attr !== 'href') assets++;
        if (local.fragment && local.file.endsWith('.html')) {
          const ids = new Set([...output.get(local.file).matchAll(/\bid="([^"]+)"/g)].map(m => decode(m[1])));
          if (!ids.has(local.fragment)) errors.push(`${name}: missing #${local.fragment} in ${local.file}`);
        }
      }
    }
    for (const img of html.matchAll(/<img\b[^>]*>/g)) {
      if (!/\balt="[^"]*"/.test(img[0])) errors.push(`${name}: image missing alternative text`);
    }
    if (name !== '404.html' && !/<main\b/.test(html)) errors.push(`${name}: missing main landmark`);
  }
  // CSS font/image dependencies must be present and local too.
  for (const [name, css] of output) {
    if (!name.endsWith('.css')) continue;
    const urls = [...css.matchAll(/url\(([^)]+)\)/gi)].map(m => m[1]);
    urls.push(...[...css.matchAll(/@import\s+["']([^"']+)["']/gi)].map(m => m[1]));
    for (const raw of urls) {
      const target = raw.replace(/^["']|["']$/g, '');
      if (target.startsWith('data:') || target.startsWith('#')) continue;
      let local;
      try { local = resolveLocal(name, target); } catch(e) { errors.push(`${name}: ${e.message}`); continue; }
      if (!local) errors.push(`${name}: remote CSS dependency`);
      else if (!output.has(local.file)) errors.push(`${name}: missing CSS asset ${local.file}`);
    }
  }
  return { errors: [...new Set(errors)], pages, links, assets };
}
export function checkNavigation(navigation, markdown) {
  const errors = [], seen = new Set();
  const required = ['getting-started','guide','architecture','security','reference','development','releases'];
  if (JSON.stringify(navigation.map(g => g.id)) !== JSON.stringify(required)) errors.push('Missing or reordered required sections');
  for (const group of navigation) {
    if (!group.text || !group.items?.length) errors.push(`Empty navigation group ${group.id}`);
    for (const item of group.items ?? []) {
      const route = item.link;
      if (!route.startsWith(`/${group.id}/`)) errors.push(`Context mismatch ${route}`);
      const name = `${route.slice(1)}${route.endsWith('/') ? 'index' : ''}.md`;
      if (seen.has(name)) errors.push(`Duplicate navigation ${name}`);
      seen.add(name);
      if (!item.text || !markdown.has(name)) errors.push(`Missing navigation page ${name}`);
    }
  }
  for (const name of markdown) if (name !== 'index.md' && !seen.has(name)) errors.push(`Unreachable page ${name}`);
  return errors;
}
export function publicationErrors(name, text) {
  const errors = [];
  if (/\/Users\/|\/home\/[a-z][a-z0-9_-]*\/|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-proj-[A-Za-z0-9_-]{20,}/.test(text)) errors.push(`${name}: private path or credential pattern`);
  if (/harness-development\/[\w./-]+\.(?:json|jsonl|sqlite|db)/.test(text)) errors.push(`${name}: private evidence reference`);
  return errors;
}
export async function checkSite() {
  const outputRoot = path.join(site, '.vitepress/dist');
  const outFiles = await filesBelow(outputRoot);
  const output = new Map(await Promise.all(outFiles.map(async f => [path.relative(outputRoot, f).split(path.sep).join('/'), await readFile(f, 'utf8')])));
  const result = checkOutput(output);
  const errors = [...result.errors];
  const sourceFiles = (await filesBelow(site, new Set(['.vitepress', 'node_modules']))).filter(f => f.endsWith('.md') && !f.includes(`${path.sep}.vitepress${path.sep}`) && !f.includes(`${path.sep}node_modules${path.sep}`));
  const navigation = JSON.parse(await readFile(path.join(site, '.vitepress/navigation.json'), 'utf8'));
  errors.push(...checkNavigation(navigation, new Set(sourceFiles.map(f => path.relative(site, f)))));
  for (const f of sourceFiles) {
    const text = await readFile(f, 'utf8');
    errors.push(...publicationErrors(path.relative(site, f), text));
    if (text.length < 200) errors.push(`${f}: empty or inadequate page`);
    for (const [, repoFile] of text.matchAll(/https:\/\/github\.com\/fjmedina21\/ai-harness\/blob\/[^/]+\/([^\s)#"<>]+)/g)) {
      const candidate = path.resolve(root, decodeURIComponent(repoFile));
      if (!candidate.startsWith(root) || !(await lstat(candidate).catch(() => null))?.isFile()) errors.push(`${path.relative(site,f)}: missing source reference ${repoFile}`);
    }
  }
  for (const [name, text] of output) if (/\.(html|js|css|svg|json)$/.test(name)) errors.push(...publicationErrors(name, text));
  const canonical = [path.join(root, 'README.md'), path.join(root,'CHANGELOG.md'), ...(await filesBelow(path.join(root,'docs'))).filter(f => f.endsWith('.md'))];
  let repositoryLinks = 0;
  for (const file of canonical) {
    const text = (await readFile(file,'utf8')).replace(/```[\s\S]*?```/g, '');
    for (const [, target] of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^[a-z]+:|^#|^\/\//i.test(target)) continue;
      const destination = path.resolve(path.dirname(file), decodeURIComponent(target.split('#')[0]));
      repositoryLinks++;
      if (!destination.startsWith(root) || !(await lstat(destination).catch(() => null))) errors.push(`${path.relative(root,file)}: missing repository link ${target}`);
    }
  }
  const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  if (!output.get('index.html')?.includes(`Experimental — v${version}`)) errors.push('Home version marker drift');
  if (![...output.keys()].some(k => /localSearchIndex/.test(k))) errors.push('Missing bundled local search index');
  if (!output.get('reference/cli.html')?.includes('shiki')) errors.push('Missing syntax highlighting');
  for (const f of outFiles.filter(f => f.endsWith('.svg'))) {
    const text = await readFile(f, 'utf8');
    if (!/<title\b/.test(text)) errors.push(`SVG missing title: ${path.relative(outputRoot,f)}`);
  }
  const config = await readFile(path.join(site,'.vitepress/config.ts'),'utf8');
  if (!config.includes("base: '/ai-harness/'") || !config.includes('cleanUrls: false') || !config.includes("provider: 'local'")) errors.push('Static configuration boundary drift');
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log(`Documentation verified: ${sourceFiles.length} source pages; ${result.pages} HTML pages; ${result.links} local references; ${result.assets} asset references; ${outFiles.length} output files; ${repositoryLinks} repository Markdown paths.`);
  console.log('External URL availability, dynamic browser behavior and formal WCAG compliance are separate checks.');
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkSite().catch(error => { console.error(error.message); process.exitCode = 1; });
}
