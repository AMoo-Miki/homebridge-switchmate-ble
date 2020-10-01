# homebridge-switchmate-ble

Homebridge plugin for Switchmate light switches and power outlets, allowing them to be exposed to Apple's HomeKit and HTTP.

**Note:** v1.3.0 adds the new v3 signature and depends on NodeJS v14. I like to test the plugin for a few weeks but I have rushed it out to allow you to use it. I will be testing and improving the plugin for a few weeks. My setup uses BlueZ v5.55 on an RPi 3 but if you face a problem, don't hesitate to raise an issue; bare in mind that I might not be able to address it for weeks due to... hmm... you know... life!

## Installation
After fulfilling the prerequisites, install this plugin using `npm i -g homebridge-switchmate-ble`.

Update the `config.json` file of your Homebridge setup, by modifying the sample configuration below.

#### Prerequisites
This plugin depends on [@abandonware/noble](https://www.npmjs.com/package/@abandonware/noble). Refer to [their prerequisites](https://github.com/abandonware/noble#prerequisites) to prepare your system. 

#### Permissions
NodeJS needs permission to control the Bluetooth radio on your system. Execute the command below to give NodeJS the capability use raw sockets and manage the interface.
```
sudo setcap 'cap_net_raw,cap_net_admin+eip' `which node`
```

## Updating
Update to the latest release of this plugin using `npm i -g homebridge-switchmate-ble`.

If you feel brave, want to help test unreleased updates, or are asked to update to the latest _unreleased_ version of the plugin, use `npm i -g AMoo-Miki/homebridge-switchmate-ble`. 

## Configurations
This plugin lets you group switches to manage three-way switches. It also optionally exposes your devices via HTTP, with and without authentication.

#### Finding your Switchmate
Run `switchmate-ble find` to find the Switchmate devices around you. This would list the `id` and version of the devices found.
* `v1` devices need to be paired before they can be operated. Use `switchmate-ble pair ID`, replacing "ID" with the `id` of your version 1 switch, to get the `authCode`.
* `v3` devices don't use pairing!!!

The configuration parameters to enable your devices would need to be added to `platforms` section of the Homebridge configuration file.
```json5
{
    ...
    "platforms": [
        ...
        /* The block you need to enable this plugin */
        {
            "platform": "SwitchmateBLE",

            /* To enable HTTP control, set the port number you want
             * it to listen on.
             * Omitting this field or setting it to false will
             * disable the HTTP server.
             */
            "http": 50505,

            /* To enable authentication, set both the fields below */
            "httpUser": "unique-user",
            "httpPass": "Un!9u3p4$5W0rD",

            "devices": [
                /* This is a v1 switch */
                {
                    "name": "Garage Light",
                    "id": "ffee5500eeaa",
                    "authCode": "aOsDXw=="
                },
                /*  This is a v3 switch or plug */
                {
                    "name": "Hallway Plug",
                    "id": "aacc2211aabb"
                },
                /*  This is a 3-way switch with v1 and v3 mixed  */
                {
                    "name": "Kitchen Lights",
                    "group" : [
                        {   
                            "id": "aa11bb22cc33",
                            "authCode": "3WeRbA=="
                        },
                        {   
                            "id": "aa11bb22cc44"
                        }
                    ]
                }
            ]
        }
        /* End of the block needed to enable this plugin */
    ]
    ...
}
```

## Note
The plugin periodically checks on `v1` switches as often as 6 times a minute. For `v3` devices, it just connects and holds the connection.

If you use the Switchmate app on your phone or tablet to control a switch or plug, the `authCode` for `v1` switches might change and `v3` devices might stop responding to this plugin. If this happens to a device, re-pair to get a new `authCode` in case of `v1` switches, unplug and re-plug in the case of plugs, and remove and re-insert batteries for a `v3` switch.

I recommend you not add the plugs and switches to the Switchmate app to prevent them from updating and instead use the HTTP server to integrate with Alexa and others.

Also, some Switchmates are simply unreliable. I have a bunch that work for a day and then just stop working. There is nothing the plugin can do to wake them up or prevent them from going bad.   