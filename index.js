const SwitchAccessory = require('./lib/SwitchAccessory');
const OutletAccessory = require('./lib/OutletAccessory');

const scanner = require('./lib/scanner');

const PLUGIN_NAME = 'homebridge-switchmate-ble';
const PLATFORM_NAME = 'SwitchmateBLE';
const SWITCH_TYPE = scanner.SWITCH;
const OUTLET_TYPE = scanner.OUTLET;

const CLASS_DEF = {[OUTLET_TYPE]: OutletAccessory, [SWITCH_TYPE]: SwitchAccessory};

let Characteristic, PlatformAccessory, Service, Categories, UUID;

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

        if (this.config.timeout) scanner.timeout = this.config.timeout;
        if (this.config.gap) scanner.gap = this.config.gap;
        if (!isFinite(this.config.http) || this.config.http < 80) this.config.http = false;
        if (this.config.http) require('./lib/WebControl').start(this);

        this.groups = [];
        this.devices = {};

        this.config.devices.forEach(config => {
            const {group, id, authCode, ...context} = config;
            const devices = (Array.isArray(group) ? group : [{id: id, authCode: authCode}]).filter(device => {
                if (/^[0-9a-f]{12}$/i.test(device.id)) return true;
                this.log.error('Invalid device id: %s in %s', device.id, JSON.stringify(config));
            });

            if (devices.length > 0) {
                const idx = this.groups.length;
                const ids = [];
                devices.forEach(device => {
                    this.devices[device.id] = {name: 'switchmate-' + device.id.slice(8), ...device, _group: idx};
                    ids.push(device.id);
                });
                ids.sort();
                const shortIds = ids.map(id => id.slice(8)).join('.');
                this.groups.push({
                    model: shortIds,
                    hwid: ids.join('.'),
                    ...context,
                    devices: devices,
                    UUID: UUID.generate(PLUGIN_NAME + ':' + ids.join('-')),
                    name: config.name || shortIds
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

        scanner.on('discover', device => {
            if (!device || !device.id) return;
            if (connectedDevices.includes(device.id)) return;

            if (!this.devices[device.id]) return this.log.warn('Discovered a device that has not been configured yet (%s).', device.id);

            connectedDevices.push(device.id);

            const group = this.groups[this.devices[device.id]._group];

            let locatedCount = 0;
            group.devices.forEach((config, idx) => {
                if (device.id === config.id) {
                    device._config = config;
                    group.devices[idx]._located = device;
                    locatedCount++;
                } else if (config._located) locatedCount++;
            });

            this.log.info('Discovered %s:%s (%d of %d)', group.name, device.id, locatedCount, group.devices.length);

            if (group.devices.length === locatedCount && locatedCount > 0) {
                const {devices, ...context} = group;
                this.addAccessory({
                    ...context,
                    devices: devices.map(device => device._located)
                });
            }
        });
        scanner.start(null, Object.keys(this.devices));
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
        if (group.devices.length > 1 && group.devices.some(device => device.type === scanner.OUTLET)) {
            this.log.debug('Outlets cannot participate in groups (%s)', group.name);
            return;
        } else {
            group.type = group.devices[0].type;
        }

        const Accessory = CLASS_DEF[group.type];

        let accessory = this.cachedAccessories.get(group.UUID),
            isCached = true;

        if (!accessory) {
            accessory = new PlatformAccessory(group.name, group.UUID, Accessory.getCategory(Categories));
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, 'Switchmate')
                .setCharacteristic(Characteristic.Model, group.model)
                .setCharacteristic(Characteristic.SerialNumber, '1.0');

            isCached = false;
        }

        this.cachedAccessories.set(group.UUID, new Accessory(this, accessory, group, !isCached));
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