const noble = require('@abandonware/noble');
const NobleDevice = require('noble-device');
const EventEmitter = require('events');
const debug = require('debug')('SwitchmateBLE:Scanner');

const SWITCHMATE_SERVICE_UUID_1 = '000015231212efde1523785feabcd123';
const SWITCHMATE_SERVICE_UUID_3 = 'a22bd383ebdd49acb2e740eb55f5d0ab';

const STATE_STOPPED = 0;
const STATE_STARTED = 1;
const STATE_STARTING = 2;
const STATE_PAUSED = 3;

class Scanner extends EventEmitter {
    constructor(deviceIds) {
        super();

        this.deviceIds = Array.isArray(deviceIds) ? deviceIds : [];
        this.discoveredIds = [];
        this.excludedIds = {};
        this.unreachables = {};
        this._startTimer = null;
        this._stopTimer = null;
        this._gap = 10000;
        this._timeout = 30000;

        noble._bindings._hci.on('leScanEnableSetCmd', enabled => {
            if (this.state === STATE_STOPPED) return;

            if (this._startTimer) {
                clearTimeout(this._startTimer);
                this._startTimer = null;
            }

            if (enabled) {
                debug('Scanning started');

                this.state = STATE_STARTED;

            } else {
                debug('Scanning was terminated. Restarting momentarily...');

                this._startTimer = setTimeout(() => {
                    this.start();
                }, 1000 * (8 * Math.random() + 2));
            }
        });

        noble.on('discover', this.onDiscover.bind(this));
    }

    start(svcIds, deviceIds) {
        let outputToConsole = true;
        if (deviceIds !== null) {
            if (Array.isArray(deviceIds)) this.deviceIds = deviceIds;

            if (this.deviceIds.length === 0) return debug('Error: no devices ids have been defined.');

            this.discoveredIds = [].concat(Object.keys(this.excludedIds));
            if (this.deviceIds.length <= this.discoveredIds) {
                debug('Delaying unnecessary scan.');

                this._startTimer = setTimeout(() => {
                    this.start();
                }, 60000);

                return;
            }
        } else {
            this.deviceIds = [];
            outputToConsole = false;
        }

        this.state = STATE_STARTING;

        const _onNobleOn = () => {
            if (noble.state === 'poweredOn') {
                debug('Discovery started.');
                noble.startScanning(Array.isArray(svcIds) ? svcIds : [SWITCHMATE_SERVICE_UUID_1, SWITCHMATE_SERVICE_UUID_3], true);
            }
        };

        if (noble.state === 'poweredOn') {
            _onNobleOn();
        } else {
            noble.once('stateChange', _onNobleOn);
        }

        this._stopTimer = setTimeout(() => {
            debug('Stopping an incomplete scan.');
            this.stop(true);
        }, this._timeout);
    }

    stop(internal) {
        if (internal && this.state === STATE_STOPPED) return;
        if (!internal) debug('Pausing scan...');
        this.state = STATE_STOPPED;
        noble.stopScanning();

        if (this._startTimer) clearTimeout(this._startTimer);
        if (this._stopTimer) clearTimeout(this._stopTimer);
        if (internal) {
            this._startTimer = setTimeout(() => {
                this.start();
            }, this._gap);

            this.postDiscovery();
        }
    }

    onDiscover(peripheral) {
        if (!peripheral.id || !peripheral.advertisement || this.discoveredIds.includes(peripheral.id) || (this.deviceIds.length && !this.deviceIds.includes(peripheral.id))) return;

        const {serviceUuids, serviceData, manufacturerData} = peripheral.advertisement;

        let version, type;

        if (serviceUuids.includes(SWITCHMATE_SERVICE_UUID_3) && manufacturerData) {
            version = 3;
            type = {4: Scanner.SWITCH, 6: Scanner.SWITCH, 8: Scanner.OUTLET}[manufacturerData.length];
        } else if (
            serviceUuids.includes(SWITCHMATE_SERVICE_UUID_1) &&
            Array.isArray(serviceData) &&
            serviceData[0] &&
            serviceData[0].data
        ) {
            version = 1;
            type = Scanner.SWITCH;
        }

        if (version && type) {
            const device = new NobleDevice(peripheral);
            device.version = version;
            device.type = type;

            this.discoveredIds.push(device.id);
            this.unreachables[device.id] = 0;

            debug(`Discovered ${device.type} (v${device.version}):`, device.id);
            this.emit('discover', device);

            this.postDiscovery(true);
        } else {
            debug('Failed to parse', manufacturerData.length, manufacturerData);
        }
    }

    postDiscovery(stopIfDone) {
        if (stopIfDone) {
            if (this.deviceIds.length && this.deviceIds.length === this.discoveredIds.length) this.stop(true);
        } else {
            this.deviceIds.forEach(id => {
                if (!this.discoveredIds.includes(id)) {
                    if (!this.unreachables[id]) this.unreachables[id] = 0;
                    if (this.unreachables[id]++ > 6) {
                        this.emit('unreachable', id);
                    }
                }
            });
        }
    }

    exclude(id, reason) {
        if (this.deviceIds.includes(id)) this.excludedIds[id] = reason || true;
    }

    unexclude(id) {
        delete this.excludedIds[id];
    }

    get gap() {
        return this._gap;
    }

    set gap(value) {
        this._gap = Math.max(10000, (isFinite(value) ? value : 1) * 1000);
    }

    get timeout() {
        return this._timeout;
    }

    set timeout(value) {
        this._timeout = Math.max(3 * this._timeout, (isFinite(value) ? value : 1) * 1000);
    }

    static get SWITCH() {
        return 'switch';
    }

    static get OUTLET() {
        return 'outlet';
    }

    get SWITCH() {
        return Scanner.SWITCH;
    }

    get OUTLET() {
        return Scanner.OUTLET;
    }
}

module.exports = scanner = new Scanner();

//scanner.start(null, ['e75d9b11b6cc', 'd0100fffd87e', 'd3bfd9d53354', 'd5cc2a05d486', 'f20dfd538b9a']);