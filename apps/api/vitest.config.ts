// Each API test file opens its own in-process database (PGlite) and runs every migration;
// with several files at once on a busy machine that can take longer than vitest's 10 s default.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { hookTimeout: 60_000 } });
