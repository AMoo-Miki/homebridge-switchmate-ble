#!/usr/bin/env node

const program = require('commander');
const path = require('path');
const fs = require('fs-extra');

const ROOT = path.resolve(__dirname);

program
    .version('v' + fs.readJSONSync(path.join(ROOT, '../package.json')).version, '-v, --version', 'output package version')
    .command('find', 'find devices and obtain their ids', {isDefault: true})
    .command('pair <id>', 'pair with a device')
    .parse(process.argv);