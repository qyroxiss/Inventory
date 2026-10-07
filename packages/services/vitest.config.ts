import { defineConfig } from 'vitest/config';

// Each test file opens its own in-memory database (PGlite) and runs every migration in its
// setup. Run in parallel, those setups time out on a busy machine, so files run one at a time.
export default defineConfig({
  test: { fileParallelism: false },
});
