class SwitchAccessory {
    constructor(...props) {
        let isNew;
        [this.platform, this.accessory, this.group, isNew = true] = [...props];
        const {log: log, api: {hap: {Service: Service, Characteristic: Characteristic}}} = this.platform;

        if (isNew) {
            this.accessory.addService(Service.Lightbulb, this.group.name);
            this.platform.registerPlatformAccessories(this.accessory);
        }

        this.accessory.on('identify', function(paired, callback) {
            this.log("%s - identify", this.group.name);
            callback();
        }.bind(this));

        const service = this.accessory.getService(Service.Lightbulb);

        const characteristicOn = service.getCharacteristic(Characteristic.On)
            .updateValue(true)
            .on('get', this.getState.bind(this))
            .on('set', this.setState.bind(this));
    }

    getState(callback) {
        callback(null, true);
    }

    setState(callback) {
        callback(null, true);
    }
}

module.exports = SwitchAccessory;