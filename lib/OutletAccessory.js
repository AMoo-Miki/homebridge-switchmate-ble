class OutletAccessory {
    constructor(...props) {
        let isNew;
        [this.platform, this.accessory, this.group, isNew = true] = [...props];
        const {log: log, api: {hap: {Service: Service, Characteristic: Characteristic}}} = this.platform;

        if (isNew) {
            this.accessory.addService(Service.Outelet, this.group.name + ' 1', 'outlet 1');
            this.accessory.addService(Service.Outelet, this.group.name + ' 2', 'outlet 2');
            this.platform.registerPlatformAccessories(this.accessory);
        }

        this.accessory.on('identify', function(paired, callback) {
            this.log("%s - identify", this.group.name);
            callback();
        }.bind(this));

        const service = this.accessory.getService(Service.Lightbulb);

        const characteristic1On = service.getCharacteristic(Characteristic.On)
            .updateValue(true)
            .on('get', this.getState.bind(this, 0))
            .on('set', this.setState.bind(this, 0));

        const characteristic2On = service.getCharacteristic(Characteristic.On)
            .updateValue(true)
            .on('get', this.getState.bind(this, 1))
            .on('set', this.setState.bind(this, 1));
    }

    getState(idx, callback) {
        callback(null, true);
    }

    setState(idx, callback) {
        callback(null, true);
    }
}

module.exports = OutletAccessory;