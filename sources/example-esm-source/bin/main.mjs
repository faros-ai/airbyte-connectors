#!/usr/bin/env -S ts-node --esm --transpile-only

import { mainCommand } from '../lib/index.js';

mainCommand().parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
