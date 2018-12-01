const async = require('async');
const scanner = require('./scanner');

const ON_SEQUENCE = Buffer.from('01000000', 'hex');
const OFF_SEQUENCE = Buffer.from('00000000', 'hex');

const POWER_SERVICE_UUID = 'a22bd383ebdd49acb2e740eb55f5d0ab';
const POWER_WRITE_CHARACTERISTIC_UUID = {
    1: 'a22b0090ebdd49acb2e740eb55f5d0ab',
    2: 'a22b0095ebdd49acb2e740eb55f5d0ab'
};
const POWER_NOTIFY_CHARACTERISTIC_UUID = {
    1: 'a22b0070ebdd49acb2e740eb55f5d0ab',
    2: 'a22b0075ebdd49acb2e740eb55f5d0ab'
};

const LIGHT_CHARACTERISTIC_UUID = 'a22b0300ebdd49acb2e740eb55f5d0ab';

const SERVICE_SUBTYPE = {
    1: 'outlet 1',
    2: 'outlet 2'
};

class OutletAccessory {
    static getCategory(Categories) {
        return Categories.OUTLET;
    }

    constructor(...props) {
        let isNew;
        [this.platform = {}, this.accessory = {}, {devices: [this.device], ...this.context}, isNew = true] = [...props];
        const {api: {hap: {Service: Service, Characteristic: Characteristic}}} = this.platform;

        if (isNew) {
            this.accessory.addService(Service.Outlet, this.context.name + ' 1', SERVICE_SUBTYPE[1]);
            this.accessory.addService(Service.Outlet, this.context.name + ' 2', SERVICE_SUBTYPE[2]);
            this.accessory.addService(Service.Lightbulb, this.context.name + ' Light');
            this.platform.registerPlatformAccessories(this.accessory);
        }

        this.accessory.on('identify', (paired, callback) => {
            this.platform.log("%s - identify", this.context.name);
            callback();
        });

        this._state = {
            1: this.device._peripheral.advertisement.manufacturerData[0] % 2 === 1,
            2: this.device._peripheral.advertisement.manufacturerData[4] % 2 === 1
        };
        this._light = true;

        this._queue = async.queue(this._setState.bind(this), 1);

        this._connectedBefore = false;

        scanner.on('discover', device => {
            if (device.id !== this.device.id) return;

            const state_1 = device._peripheral.advertisement.manufacturerData[0] % 2 === 1;
            const state_2 = device._peripheral.advertisement.manufacturerData[4] % 2 === 1;

            if (state_1 !== this._state[1]) {
                this.onChange(1, state_1);
            }

            if (state_2 !== this._state[2]) {
                this.onChange(2, state_2);
            }

            this.connect(err => {
                if (!err) this._getLight(err => {
                    if (!err && this.characteristicLight) {
                        this.characteristicLight.updateValue(this._light);
                    }
                });
            });
        });

        this._registerCharacteristics();
    }

    _registerCharacteristics() {
        const {Service, Characteristic} = this.platform.api.hap;

        this.characteristicOn = {
            1: this.accessory.getServiceByUUIDAndSubType(Service.Outlet, SERVICE_SUBTYPE[1])
                .getCharacteristic(Characteristic.On)
                    .updateValue(this._state[1])
                    .on('get', this.getState.bind(this, 1))
                    .on('set', this.setState.bind(this, 1)),

            2: this.accessory.getServiceByUUIDAndSubType(Service.Outlet, SERVICE_SUBTYPE[2])
                .getCharacteristic(Characteristic.On)
                    .updateValue(this._state[2])
                    .on('get', this.getState.bind(this, 2))
                    .on('set', this.setState.bind(this, 2))
        };

        this.characteristicLight = this.accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On)
            .updateValue(this._light)
            .on('get', this.getLight.bind(this))
            .on('set', this.setLight.bind(this))
    }

    connect(callback) {
        if (this.device.connectedAndSetUp) return callback && callback();

        this.platform.log('Connecting to %s', this.device.id);

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
            Instrumentation: next => {
                this.device.once('disconnect', () => {
                    scanner.unexclude(this.device.id);
                    this.platform.log('Disconnected from %s', this.device.id);
                });
                scanner.exclude(this.device.id, 'Connected');
                this.platform.log('Connected to %s', this.device.id);

                this.device.subscribeCharacteristic(POWER_SERVICE_UUID, POWER_NOTIFY_CHARACTERISTIC_UUID[1], data => {
                    let _state = null;
                    if (data.equals(ON_SEQUENCE)) _state = true;
                    else if (data.equals(OFF_SEQUENCE)) _state = false;

                    if (_state !== null && _state !== this._state[1]) {
                        this.onChange(1, _state);
                    }
                });

                this.device.subscribeCharacteristic(POWER_SERVICE_UUID, POWER_NOTIFY_CHARACTERISTIC_UUID[2], data => {
                    let _state = null;
                    if (data.equals(ON_SEQUENCE)) _state = true;
                    else if (data.equals(OFF_SEQUENCE)) _state = false;

                    if (_state !== null && _state !== this._state[2]) {
                        this.onChange(2, _state);
                    }
                });

                next();
            }
        }, _callback);
    }

    _setPowerState(idx, _state, callback) {
        let _done = false;
        const _callback = (err, data) => {
            if (_done) return;
            _done = true;

            if (err) return callback(err);

            if (data !== this._state[idx]) {
                this.onChange(idx, data);
            }

            callback();
        };

        setTimeout(() => {
            _callback('Error:PowerStateTimeout');
        }, 10000);

        const characteristic = this.device._characteristics[POWER_SERVICE_UUID][POWER_NOTIFY_CHARACTERISTIC_UUID[idx]];
        if (!characteristic) return _callback('Error:PowerCharacteristic:' + idx);

        characteristic.notify(true, err => {
            if (err) return _callback(err);

            characteristic.once('data', data => {
                if (data.equals(ON_SEQUENCE)) return _callback(null, true);
                if (data.equals(OFF_SEQUENCE)) return _callback(null, false);
                _callback('Error:UnknownState:' + idx);
            });

            this.device.writeDataCharacteristic(POWER_SERVICE_UUID, POWER_WRITE_CHARACTERISTIC_UUID[idx], Buffer.from([_state ? 1 : 0]), err => {
                if (err) return _callback(err);
            });
        });
    }

    onChange(idx, state) {
        this._state[idx] = state;
        this.characteristicOn[idx].updateValue(state);
    }

    getState(idx, callback) {
        callback(null, this._state[idx]);
    }

    setState(idx, state, callback) {
        this._queue.push({idx: idx, state: state}, callback);
    }

    _setState(task, callback) {
        const {idx: idx, state: _state} = task;
        async.retry({times: 5, interval: 500}, callback => {
            if (this._queue.length() > 0) return callback();

            async.series({
                Connect: next => {
                    this.connect(next);
                },
                Set: next => {
                    if (this._queue.length() > 0) return next();

                    this._setPowerState(idx, _state, (err, data) => {
                        if (err) return callback(err);

                        if (data !== this._state[idx]) {
                            this.onChange(idx, data);
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

    getLight(callback) {
        callback(null, this._light);
    }

    setLight(state, callback) {
        async.series({
            Connect: next => {
                this.connect(next);
            },
            Set: next => {
                this.device.writeDataCharacteristic(POWER_SERVICE_UUID, LIGHT_CHARACTERISTIC_UUID, Buffer.from([state ? 1 : 0]), err => {
                    if (err) return next(err);

                    setTimeout(() => {
                        this._getLight(err => {
                            if (err) return next(err);

                            next(null, this._light === state);
                        });
                    }, 3000);
                });
            }
        }, callback);
    }

    _getLight(callback) {
        this.device.readDataCharacteristic(POWER_SERVICE_UUID, LIGHT_CHARACTERISTIC_UUID, (err, data) => {
            if (err) return callback(err);

            this._light = data && data[0] === 1;
            callback();
        });
    }
}

module.exports = OutletAccessory;