const SwitchmateAccessory = require('./lib/SwitchmateAccessory');

const PLUGIN_NAME = 'homebridge-switchmate-ble';
const PLATFORM_NAME = 'SwitchmateBLE';

let Characteristic, PlatformAccessory, Service, Categories, UUID;

UUID = { generate: () => {}};

module.exports = function(homebridge) {
    ({
        platformAccessory: PlatformAccessory,
        hap: {Characteristic, Service, Accessory: {Categories}, uuid: UUID}
    } = homebridge);

    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, SwitchmateBLE, true);
};

class SwitchmateBLE {
    constructor(...props) {
        [this.log, this.config, this.api] = [...props];

        this.cachedAccessories = new Map();

        this.groups = [];
        this.devices = {};
        this.config.devices.forEach(config => {
            const devices = (Array.isArray(config.group) ? config.group : [config]).filter(device => {
                if (/^[0-9a-f]{12}$/i.test(device.id)) return true;
                this.log.error('Invalid device id: %s', device.id);
            });

            if (devices.length > 0) {
                const idx = this.groups.length;
                const ids = [];
                devices.forEach(device => {
                    this.devices[device.id] = {name: 'switchmate-' + device.id.slice(8), ...device, _group: idx};
                    ids.push(device.id);
                });
                ids.sort();
                this.groups.push({
                    devices: devices,
                    UUID: UUID.generate(PLUGIN_NAME + ':' + ids.join('-')),
                    name: config.name || ids.map(id => id.slice(8)).join('-')
                });
            }
        });

        this.api.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }

    discoverDevices() {
        const connectedDevices = [];
        const deviceIds = Object.keys(this.devices);
        if (deviceIds.length === 0) return this.log.error('No valid configured devices found.');

        this.log.debug('Starting discovery...');

        SwitchmateAccessory.discover({ids: deviceIds})
            .on('discover', config => {
                connectedDevices.push(config.id);

                let locatedCount = 0;
                const group = this.groups[this.devices[config.id]._group];
                group.devices.forEach((device, idx) => {
                    if (device.id === config.id) {
                        group.devices[idx]._located = new SwitchmateAccessory({...this.devices[config.id], ...config});
                        locatedCount++;
                    } else if (device._located) locatedCount++;
                });

                this.log.debug('Discovered %s:%s (%d of %d)', this.devices[config.id].name, config.id, locatedCount, group.devices.length);

                if (group.devices.length === locatedCount && locatedCount > 0)
                    this.addAccessory({name: group.name, UUID: group.UUID, devices: group.devices.map(device => device._located)});
            });

        setTimeout(() => {
            deviceIds.forEach(deviceId => {
                if (connectedDevices.includes(deviceId)) return;

                this.log.debug('Failed to discover %s in time but will keep looking:', deviceId);
            });
        }, 60000);
    }

    registerPlatformAccessories(platformAccessories) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, Array.isArray(platformAccessories) ? platformAccessories : [platformAccessories]);
    }

    configureAccessory(accessory) {
        if (accessory instanceof PlatformAccessory) {
            this.cachedAccessories.set(accessory.UUID, accessory);
            accessory.services.forEach(service => {
                if (service.UUID === Service.AccessoryInformation.UUID) return;
                service.characteristics.some(characteristic => {
                    if (!characteristic.props ||
                        !Array.isArray(characteristic.props.perms) ||
                        characteristic.props.perms.length !== 3 ||
                        !(characteristic.props.perms.includes(Characteristic.Perms.WRITE) && characteristic.props.perms.includes(Characteristic.Perms.NOTIFY))
                    ) return;

                    this.log.info('Marked %s unreachable by faulting Service.%s.%s', accessory.displayName, service.displayName, characteristic.displayName);

                    characteristic.updateValue(new Error('Unreachable'));
                    return true;
                });
            });
        } else {
            this.log.debug('Unregistering', accessory.displayName);
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    addAccessory(group) {
        console.log(group.map(d => { return {id: d.context.id, v: d.context.version, t: d.context.type}; }));
        if (group.devices.length > 1 && group.devices.some(device => device.context.type === SwitchmateAccessory.OUTLET)) {
            this.log.debug('Outlets cannot participate in groups (%s)', group.name);
            return;
        } else {
            group.type = group.devices[0].context.type;
        }

        const deviceConfig = group.context;
        const type = (deviceConfig.type || '').toLowerCase();

        const Accessory = CLASS_DEF[type];

        let accessory = this.cachedAccessories.get(deviceConfig.UUID),
            isCached = true;

        if (!accessory) {
            accessory = new PlatformAccessory(deviceConfig.name, deviceConfig.UUID, Accessory.getCategory(Categories));
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, (PLATFORM_NAME + ' ' + deviceConfig.manufacturer).trim())
                .setCharacteristic(Characteristic.Model, deviceConfig.model || "Unknown")
                .setCharacteristic(Characteristic.SerialNumber, deviceConfig.id.slice(8));

            isCached = false;
        }

        this.cachedAccessories.set(deviceConfig.UUID, new Accessory(this, accessory, group, !isCached));
    }

    removeAccessory(homebridgeAccessory) {
        if (!homebridgeAccessory) return;

        delete this.cachedAccessories[homebridgeAccessory.deviceId];
        this.api.unregisterPlatformAccessories(PLATFORM_NAME, PLATFORM_NAME, [homebridgeAccessory]);
    }

    removeAccessoryByUUID(uuid) {
        if (!uuid || !this.cachedAccessories.has(uuid)) return;

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.cachedAccessories.get(uuid)]);

        this.cachedAccessories.delete(uuid);
    }
}