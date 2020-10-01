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
    //console.log(`Found a ${device.type} (v${device.version}) with id of ${device.id}, mfg as ${device._peripheral.advertisement.manufacturerData.toString('hex')}, and svc of ${device._peripheral.advertisement.serviceUuids}`);
});
scanner.start(null, null);

setTimeout(() => {
    scanner.stop();
    process.exit(0);
}, 30000);