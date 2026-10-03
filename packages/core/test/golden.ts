import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Golden fixtures exported from the Dart app by tools/parity/dart (pnpm golden).
const dir = fileURLToPath(new URL('../../../tools/parity/golden/', import.meta.url));

export const golden = <T>(name: string): T =>
  JSON.parse(readFileSync(`${dir}${name}.json`, 'utf8')) as T;
