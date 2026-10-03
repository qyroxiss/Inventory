import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Layer boundaries from docs/ARCHITECTURE.md §2:
//   core ← db ← services ← api;  web imports core (live previews) but never db/services.
const restrict = (files, patterns, message) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
  },
});

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/.vercel/**',
      'tools/parity/dart/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/test/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  restrict(
    ['packages/core/src/**'],
    ['node:*', 'fs', 'path', '@qi/*', 'react', 'drizzle-orm*', 'hono*'],
    '@qi/core must stay pure: no IO, no other workspace packages, no framework code.',
  ),
  restrict(
    ['apps/web/**', 'packages/ui/**', 'packages/print/**'],
    ['@qi/db', '@qi/db/*', '@qi/services', '@qi/services/*', '@qi/auth', '@qi/auth/*'],
    'UI code talks to the API, never to the database or services directly.',
  ),
  restrict(
    ['packages/db/**'],
    ['@qi/services', '@qi/services/*', '@qi/auth', '@qi/auth/*'],
    '@qi/db sits below services and auth.',
  ),
);
