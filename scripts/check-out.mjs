import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'out';
const EXTERNAL = /<[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.html')) yield p;
  }
}

let found = 0;
for (const file of walk(OUT_DIR)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (EXTERNAL.test(line)) {
        console.log(`${file}:${i + 1}: ${line.trim().slice(0, 200)}`);
        found++;
      }
    });
}

if (found > 0) {
  console.error(`외부 리소스 ${found}건 발견`);
  process.exit(1);
}
console.log('외부 리소스 없음');
