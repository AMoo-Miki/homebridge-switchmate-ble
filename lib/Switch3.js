const async = require('async');
const EventEmitter = require('events');
const scanner = require('./scanner');

const ON_SEQUENCE = Buffer.from('01000000', 'hex');
const OFF_SEQUENCE = Buffer.from('00000000', 'hex');

const POWER_SERVICE_UUID = 'a22bd383ebdd49acb2e740eb55f5d0ab';
const POWER_WRITE_CHARACTERISTIC_UUID = 'a22b0090ebdd49acb2e740eb55f5d0ab';
const POWER_NOTIFY_CHARACTERISTIC_UUID = 'a22b0070ebdd49acb2e740eb55f5d0ab';

const BATTERY_SERVICE_UUID = '180f';
const BATTERY_CHARACTERISTIC_UUID = '2a19';

class Switch3 extends EventEmitter {
    constructor(platform, device) {
        super();

        this._state = device._peripheral.advertisement.manufacturerData[0] % 2 === 1;
        this._battery = null;

        this.device = device;
        this.platform = platform;

        this._queue = async.queue(this._setState.bind(this), 1);

        this._connectedBefore = false;

        scanner.on('discover', device => {
            if (device.id !== this.device.id) return;

            const state = device._peripheral.advertisement.manufacturerData[0] % 2 === 1;

            if (state !== this._state) {
                this._state = state;
                this.emit('change', state);
            }

            this.connect();
        });
    }

    connect(callback) {
        if (this.device.connectedAndSetUp) return callback && callback();

        this.platform.log('[SwitchmateBLE:Switch:3] Connecting to %s', this.device.id);

        let _done = false;
        const _callback = err => {
            if (_done) return;
            _done = true;

            if (!err) this._connectedBefore = true;

            callback && callback(err);
        };

        setTimeout(() => {
            _callback('Error:ConnectTimeout');
        }, 10000);

        async.series({
            Setup: next => {
                this.device.connectAndSetup(next);
            },
            Battery: next => {
                this.updateBatteryLevel(next);
            },
            Instrumentation: next => {
                this.device.once('disconnect', () => {
                    scanner.unexclude(this.device.id);
                    this.platform.log('[SwitchmateBLE:Switch:3] Disconnected from %s', this.device.id);
                });
                scanner.exclude(this.device.id, 'Connected');
                this.platform.log('[SwitchmateBLE:Switch:3] Connected to %s', this.device.id);

                this.device.subscribeCharacteristic(POWER_SERVICE_UUID, POWER_NOTIFY_CHARACTERISTIC_UUID, data => {
                    let _state = null;
                    if (data.equals(ON_SEQUENCE)) _state = true;
                    else if (data.equals(OFF_SEQUENCE)) _state = false;

                    if (_state !== null && _state !== this._state) {
                        this._state = _state;
                        this.emit('change', _state);
                    }
                });

                next();
            }
        }, _callback);
    }

    _getBatteryLevel(callback) {
        let _done = false;
        const _callback = (err, data) => {
            if (_done) return;
            _done = true;
            callback(err, data);
        };

        setTimeout(() => {
            _callback('Error:BatteryTimeout');
        }, 10000);

        const characteristic = this.device._characteristics[BATTERY_SERVICE_UUID][BATTERY_CHARACTERISTIC_UUID];
        if (!characteristic) return _callback('Error:BatteryCharacteristic');

        characteristic.notify(true, err => {
            if (err) return _callback(err);

            characteristic.once('data', data => _callback(null, data.readUInt8(0)));

            this.device.readUInt8Characteristic(BATTERY_SERVICE_UUID, BATTERY_CHARACTERISTIC_UUID, err => {
                if (err) return _callback(err);
            });
        });
    }

    _setPowerState(_state, callback) {
        let _done = false;
        const _callback = (err, data) => {
            if (_done) return;
            _done = true;

            if (err) return callback(err);

            if (data !== this._state) {
                this._state = data;
                this.emit('change', data);
            }

            callback();
        };

        setTimeout(() => {
            _callback('Error:PowerStateTimeout');
        }, 10000);

        const characteristic = this.device._characteristics[POWER_SERVICE_UUID][POWER_NOTIFY_CHARACTERISTIC_UUID];
        if (!characteristic) return _callback('Error:PowerCharacteristic');

        characteristic.notify(true, err => {
            if (err) return _callback(err);

            characteristic.once('data', data => {
                if (data.equals(ON_SEQUENCE)) return _callback(null, true);
                if (data.equals(OFF_SEQUENCE)) return _callback(null, false);

                this.platform.log('[SwitchmateBLE:Switch:3] Got bad state from %s', this.device.id);
                _callback('Error:UnknownState');
            });

            this.device.writeDataCharacteristic(POWER_SERVICE_UUID, POWER_WRITE_CHARACTERISTIC_UUID, Buffer.from([_state ? 1 : 0]), err => {
                if (err) return _callback(err);
            });
        });
    }

    updateBatteryLevel(callback) {
        if (!this.device.connectedAndSetUp) return callback('Error:NotConnected');

        if (this._batteryLevelTimer) clearTimeout(this._batteryLevelTimer);
        this._batteryLevelTimer = setTimeout(() => {
            this.updateBatteryLevel();
        }, 3600000);

        this._getBatteryLevel((err, data) => {
            if (err) return callback && callback(err);

            if (data !== this._battery) {
                this._battery = data;
                this.emit('battery', data);
            }

            callback && callback();
        });
    }

    get state() {
        return this._state;
    }

    get battery() {
        return this._battery;
    }

    setState(_state, callback) {
        this._queue.push(_state, callback);
    }

    _setState(_state, callback) {
        async.retry({times: 5, interval: 500}, callback => {
            if (this._queue.length() > 0) return callback();

            async.series({
                Connect: next => {
                    this.connect(next);
                },
                Set: next => {
                    if (this._queue.length() > 0) return next();

                    this._setPowerState(_state, (err, data) => {
                        if (err) return callback(err);

                        if (data !== this._state) {
                            this._state = data;
                            this.emit('change', data);
                        }

                        callback();
                    });
                }
            }, err => {
                if (err && this._queue.length() === 0) {
                    this.device.disconnect();
                }

                callback();
            });
        }, err => {
            if (this._queue.length() > 0) return callback(null, true);

            callback(err);
        });
    }
}

module.exports = Switch3;