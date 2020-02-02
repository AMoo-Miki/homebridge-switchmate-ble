const Switch1 = require('./Switch1');
const Switch3 = require('./Switch3');

class SwitchAccessory {
    static getCategory(Categories) {
        return Categories.OUTLET;
    }

    constructor(...props) {
        let isNew, devices;
        [this.platform = {}, this.accessory = {}, {devices: devices = [], ...this.context}, isNew = true] = [...props];
        const {api: {hap: {Service: Service, Characteristic: Characteristic}}} = this.platform;

        if (isNew) this._registerPlatformAccessory();

        this.accessory.on('identify', (paired, callback) => {
            this.platform.log("[SwitchmateBLE:Accessory] %s - identify", this.context.name);
            callback();
        });

        this.devices = devices.map(device => {
            switch (device.version) {
                case 1:
                    return new Switch1(this.platform, device);
                case 3:
                    return new Switch3(this.platform, device);
            }
        });

        this.devices.forEach(device => {
            device.on('change', () => {
                this._updateState();
            });

            device.on('battery', () => {
                this._updateBattery();
            });
        });

        this._registerCharacteristics();
    }

    _registerPlatformAccessory() {
        const {Service} = this.platform.api.hap;

        this.accessory.addService(Service.Outlet, this.context.name);
        this.platform.registerPlatformAccessories(this.accessory);
    }

    _registerCharacteristics() {
        const {Service, Characteristic} = this.platform.api.hap;

        const service = this.accessory.getService(Service.Outlet);

        this.characteristicOn = service.getCharacteristic(Characteristic.On)
            .updateValue(this._getCurrentState())
            .on('get', this.getState.bind(this))
            .on('set', this.setState.bind(this));
    }

    _getCurrentState() {
        return Boolean(this.devices.reduce((result, device) => result ^ device.state, this.context['reverse'] || false));
    }

    _updateState() {
        this.characteristicOn.updateValue(this._getCurrentState());
    }

    _updateBattery() {
        const {Service, Characteristic} = this.platform.api.hap;

        let batteryService = this.accessory.getService(Service.BatteryService);
        if (!batteryService) batteryService = this.accessory.addService(Service.BatteryService, this.context.name, 'battery');

        batteryService.getCharacteristic(Characteristic.ChargingState).updateValue(Characteristic.ChargingState.NOT_CHARGEABLE);


        const batteries = this.devices
            .map(device => device.battery)
            .filter(battery => battery !== null);

        const level = batteries.reduce((sum, num) => sum + num, 0) / batteries.length;

        batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(level);
        batteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(level >= 10 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL : Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
    }

    getState(callback) {
        process.nextTick(() => {
            callback(null, this._getCurrentState());
        });
    }

    setState(state, callback) {
        if (this._getCurrentState() === state) return callback(null, true);

        this.devices[0].setState(!this.devices[0].state, callback);
    }

    destroy() {
        this.platform = null;
        this.accessory = null;
        this.device = null;
    }
}

module.exports = SwitchAccessory;