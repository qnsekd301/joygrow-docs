import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const root = process.cwd();
const configFile = path.join(root, 'gitbook-docs.yaml');
const schemaUrl = 'https://api.gitbook.com/gitbook-docs.yaml';
const response = await fetch(schemaUrl);
if (!response.ok) throw new Error(`GitBook 스키마를 받지 못했습니다: HTTP ${response.status}`);

const schema = YAML.parse(await response.text());
const config = YAML.parse(await readFile(configFile, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addFormat('icon', true);
const validate = ajv.compile(schema);

if (!validate(config)) {
  console.error('gitbook-docs.yaml이 공식 스키마와 맞지 않습니다.');
  console.error(validate.errors);
  process.exit(1);
}

function collectDirectories(nodes, found = []) {
  for (const node of nodes ?? []) {
    if (node?.content?.directory) found.push(node.content.directory);
    collectDirectories(node?.structure, found);
  }
  return found;
}

const directories = collectDirectories(config.site?.structure);
for (const directory of directories) await access(path.resolve(root, directory));
console.log(`gitbook-docs.yaml 공식 스키마 검증 완료 · content.directory ${directories.length}개 존재`);
