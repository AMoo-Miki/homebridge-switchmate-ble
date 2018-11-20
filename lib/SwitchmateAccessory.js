const EventEmitter = require('events');
const noble = require('noble');
const async = require('async');
const NobleDevice = require('noble-device');

const _discovery = new EventEmitter();
_discovery.discovered = new Map();
_discovery.limitedIds = [];

const SERVICE_UUIDS = {
    v1: '000015231212efde1523785feabcd123',
    v3: 'a22bd383ebdd49acb2e740eb55f5d0ab'
};

class SwitchmateAccessory extends NobleDevice {
    constructor(props) {
        super(props);

        if (!props.id) return console.log('[SwitchmateAccessory] Insufficient details to initialize:', props);

        this.context = {version: 0, type: 0, ...props};

        const advertisement = this.context.advertisement;
        if (advertisement) {
            if (
                advertisement.serviceUuids.includes(SERVICE_UUIDS.v3) &&
                advertisement.manufacturerData
            ) {
                this.context.version = 3;
                switch (advertisement.manufacturerData.length) {
                    case 6:
                        this.context.type = SwitchmateAccessory.SWITCH;
                        break;

                    case 8:
                        this.context.type = SwitchmateAccessory.OUTLET;
                        break;
                }
            } else if (
                advertisement.serviceUuids.includes(SERVICE_UUIDS.v1) &&
                Array.isArray(advertisement.serviceData) &&
                advertisement.serviceData[0] &&
                advertisement.serviceData[0].data
            ) {
                this.context.version = 1;
                this.context.type = SwitchmateAccessory.SWITCH;
            }
        }

        this.connected = false;
        if (props.connect !== false) this._connect();
    }

    _connect() {

    }

    static discover(options) {
        let opts = options || {};

        if (opts.clear) {
            _discovery.removeAllListeners();
            _discovery.discovered.clear();
        }

        if (Array.isArray(opts.ids)) {
            _discovery.limitedIds = opts.ids;
        } else {
            _discovery.limitedIds.splice(0);
        }

        const _onDiscover = peripheral => {
            if (_discovery.discovered.has(peripheral.id) || !peripheral.advertisement) return;

            _discovery.discovered.set(peripheral.id, peripheral);
            _discovery.emit('discover', peripheral);

            if (Array.isArray(_discovery.limitedIds) &&
                _discovery.limitedIds.length &&
                _discovery.limitedIds.includes(peripheral.id) &&
                _discovery.limitedIds.length <= _discovery.discovered.size &&
                _discovery.limitedIds.every(id => _discovery.discovered.has(id))
            ) {
                process.nextTick(() => {
                    _discovery.destroy();
                });
            }
        };

        const _onNobleOn = () => {
            if (noble.state === 'poweredOn') noble.startScanning(Object.values(SERVICE_UUIDS), true);
        };

        noble.on('discover', _onDiscover);

        _discovery.stop = () => {
            noble._stopRequested = true;
            noble.stopScanning();
        };

        _discovery.destroy = () => {
            _discovery.emit('end');
            noble._stopRequested = true;
            noble.stopScanning();
            console.log('[SwitchmateAccessory] Discovery ended.');
            process.nextTick(() => {
                _discovery.removeAllListeners();
                _discovery.discovered.clear();
            });
        };

        (_discovery.start = () => {
            if (noble.state === 'poweredOn') {
                _onNobleOn();
            } else {
                noble.on('stateChange', _onNobleOn);
            }
        })();

        return _discovery;
    }

    static get SERVICE_UUIDS() {
        return SERVICE_UUIDS;
    }

    static get SWITCH() {
        return 'SWITCH';
    }

    static get OUTLET() {
        return 'OUTLET';
    }
}

module.exports = SwitchmateAccessory;