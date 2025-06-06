#!/usr/bin/env node

const path = require('path');
const packagePath = path.resolve(__dirname, '..');

require(packagePath).mainCommand().parseAsync();
