const async = require('async');
const EventEmitter = require('events');
const scanner = require('./scanner');

const RESET_SEQUENCE = Buffer.from('200104', 'hex');
const CHANGE_SEQUENCE = Buffer.from('200100', 'hex');

const SERVICE_UUID = '000015231212efde1523785feabcd123';
const STATUS_CHARACTERISTIC_UUID = '000015261212efde1523785feabcd123';

class Switch1 extends EventEmitter {
    constructor(platform, device) {
        super();

        this._state = device._peripheral.advertisement.serviceData[0] ? device._peripheral.advertisement.serviceData[0].data[4] % 2 === 1 : null;

        this.device = device;
        this.platform = platform;

        const _authCode = Buffer.from(device._config.authCode, 'base64');
        this._onCode = this._sign(Buffer.concat([Buffer.from('0101', 'hex'), _authCode]));
        this._offCode = this._sign(Buffer.concat([Buffer.from('0100', 'hex'), _authCode]));

        this._queue = async.queue(this._setState.bind(this), 1);

        scanner.on('discover', device => {
            if (device.id !== this.device.id) return;

            const state = device._peripheral.advertisement.serviceData[0].data[4] % 2 === 1;

            if (state !== this._state) {
                this._state = state;
                this.emit('change');
            }
        });
    }

    connect(callback) {
        if (this.device.connectedAndSetUp) return callback();

        this.platform.log('[SwitchmateBLE:Switch:1] Connecting to %s', this.device.id, this.device._config.authCode);
        let _done = false;
        const _callback = err => {
            if (_done) return;
            _done = true;

            if (err) this.device.disconnect();
            callback(err);
        };

        setTimeout(() => {
            _callback('Error:ConnectTimeout');
        }, 10000);

        this.device.connectAndSetup(_callback);
    }

    _sign(data) {
        const len = data.length;
        const bytes = Buffer.alloc(6);
        let sig = data[0] << 7;

        for (const octet of data) {
            sig = ((1000003 * sig) ^ (octet & 255)) ^ len;
        }

        bytes.writeUIntLE(sig >>> 0, 0, 4);
        data.copy(bytes, 4);

        return bytes;
    }

    get state() {
        return this._state;
    }

    setState(_state, callback) {
        this._queue.push(_state, callback);
    }

    _setState(_state, callback) {
        async.retry({times: 5, interval: 500}, callback => {
            if (this._queue.length() > 0) return callback();
            async.series({
                Stop: next => {
                    scanner.stop();
                    next();
                },
                Connect: next => {
                    this.connect(next);
                },
                Set: next => {
                    if (this._queue.length() > 0) return next();

                    let _done = false;
                    const _next = err => {
                        if (_done) return;
                        _done = true;
                        next(err);
                    };

                    setTimeout(() => {
                        _next('Error:WriteTimeout');
                    }, 10000);

                    const characteristic = this.device._characteristics[SERVICE_UUID][STATUS_CHARACTERISTIC_UUID];
                    if (!characteristic) return _next('Error:PowerCharacteristic');

                    characteristic.notify(true, err => {
                        if (err) return _next(err);

                        characteristic.once('data', data => {
                            if (data.equals(RESET_SEQUENCE)) {
                                this.platform.log('[SwitchmateBLE:Switch:1] Switch %s has reset itself. A new authCode has to be obtained by re-pairing it.', this.device.id);
                                return _next('Error:Reset');
                            }
                            if (!data.equals(CHANGE_SEQUENCE)) return _next('Error:WriteFailed');

                            _next(null, true);
                        });

                        this.device.writeDataCharacteristic(SERVICE_UUID, STATUS_CHARACTERISTIC_UUID, _state ? this._onCode : this._offCode, err => {
                            if (err) return _next(err);
                        });
                    });
                }
            }, err => {
                if (err && this._queue.length() === 0) {
                    return this.device.disconnect(() => {
                        callback(err);
                    });
                }

                callback();
            });
        }, err => {
            if (this._queue.length() > 0) return callback(null, true);
            if (err) this.platform.log('[SwitchmateBLE:Switch:1] Error', err);

            this.device.disconnect();
            scanner.start();

            callback(err);
        });
    }
}

module.exports = Switch1;