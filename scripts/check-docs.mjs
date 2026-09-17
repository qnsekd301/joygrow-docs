import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const summary = await readFile(path.join(root, 'SUMMARY.md'), 'utf8');
const summaryTargets = new Set(
  [...summary.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map((match) => path.normalize(match[1])),
);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.name.endsWith('.md')) files.push(target);
  }
  return files;
}

for (const file of await walk(root)) {
  const body = await readFile(file, 'utf8');
  const links = [...body.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const clean = decodeURIComponent(link.split('#')[0]);
    try { await access(path.resolve(path.dirname(file), clean)); }
    catch { errors.push(`${path.relative(root, file)} -> ${link}`); }
  }
}

const inventory = await readFile(path.join(root, 'docs-inventory.md'), 'utf8');
for (const match of inventory.matchAll(/`((?:getting-started|student|teacher|admin|help)\/[a-z0-9-]+\.md)`/g)) {
  const relative = path.normalize(match[1]);
  try { await access(path.join(root, relative)); }
  catch { errors.push(`docs-inventory.md -> ${match[1]}`); }
  if (!summaryTargets.has(relative)) errors.push(`SUMMARY.md에 없음 -> ${match[1]}`);
}

const manifest = JSON.parse(await readFile(path.join(root, 'images', 'capture-manifest.json'), 'utf8'));
for (const relative of manifest.captured ?? []) {
  try { await access(path.join(root, 'images', relative)); }
  catch { errors.push(`capture-manifest.json -> images/${relative}`); }
}

if (errors.length) {
  console.error(`깨진 로컬 링크 ${errors.length}개:\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('목차, 인벤토리, Markdown 링크와 캡처 이미지 경로가 모두 유효합니다.');
}
