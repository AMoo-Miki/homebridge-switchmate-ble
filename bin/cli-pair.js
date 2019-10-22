#!/usr/bin/env node

const program = require('commander');
const fs = require('fs-extra');
const scanner = require('../lib/scanner');

const SWITCHMATE_SERVICE_UUID_1 = '000015231212efde1523785feabcd123';
const AUTH_CHARACTERISTIC_UUID =  '000015291212efde1523785feabcd123';

const AUTH_START_SEQUENCE = Buffer.from('0000000001', 'hex');
const AUTH_FAIL_SEQUENCE = Buffer.from('200103', 'hex');

// Disable debug messages from noble
try {
    require('debug').disable();
} catch(ex) {}

let id;

program
    .name('switchmate-ble pair')
    .arguments('<id>')
    .action(_id => {
        id = _id;
    })
    .parse(process.argv);

const getAuthCode = device => {
    let _done = false;
    const _next = err => {
        if (_done) return;
        _done = true;
        if (err) {
            console.error(err);
        }

        process.exit(0);
    };

    if (!device.connectedAndSetUp) {
        return _next('Failed to connect.');
    }

    //console.log(device._characteristics);

    const characteristic = device._characteristics[SWITCHMATE_SERVICE_UUID_1][AUTH_CHARACTERISTIC_UUID];
    if (!characteristic) {
        return _next('Failed to link.');
    }

    characteristic.notify(true, err => {
        if (err) return _next(err);

        characteristic.once('data', data => {
            if (data.equals(AUTH_FAIL_SEQUENCE)) {
                return _next('Failed to get authCode.');
            }

            console.log('The `authCode` is', data.slice(3).toString('base64'));

            _next(null, true);
        });

        device.writeDataCharacteristic(SWITCHMATE_SERVICE_UUID_1, AUTH_CHARACTERISTIC_UUID, AUTH_START_SEQUENCE, err => {
            if (err) return _next(err);
            console.log('*** Press the button on the device now ***\n\n');
        });
    });

};

scanner.on('discover', device => {
   console.log(`Connected to ${device.id}, a ${device.type} (v${device.version})`);
   scanner.stop();
   if (device.version !== 1) {
       console.log('This device does not need pairing.');
   } else if (device.connectedAndSetUp) {
       getAuthCode(device);
   } else {
       device.connectAndSetup(() => {
           getAuthCode(device);
       });
   }
});
scanner.start(null, [id]);

setTimeout(() => {
    scanner.stop();
    process.exit(0);
}, 30000);