#!/usr/bin/env node

const program = require('commander');
const scanner = require('../lib/scanner');

// Disable debug messages from noble
try {
    require('debug').disable();
} catch (ex) {}

program
    .name('switchmate-ble find')
    .parse(process.argv);

scanner.on('discover', device => {
    console.log(`Found a ${device.type} (v${device.version}) with id of ${device.id}`);
});
scanner.start(null, null);

setTimeout(() => {
    scanner.stop();
    process.exit(0);
}, 30000);