import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { EcocontrolAccessory } from './EcocontrolAccessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ExampleHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    try {
      const mDnsSd = require('node-dns-sd');

      mDnsSd.discover({
        name: '_services._dns-sd._udp.local',
        type: 'PTR',
        key: 'fqdn',
      }).then((device_list) =>{
        device_list.forEach((device) => {

          if(device.fqdn == '_mesh-http._tcp.local') {
            this.validateDeviceIp(device.address);
          }
        });
      }).catch((error) => {
        this.log.error(error);
      });
    } catch(e) {
      this.log.error(JSON.stringify(e));
    }

    /*
    "address": "192.168.0.27",
    "fqdn": "_mesh-http._tcp.local",
    "modelName": null,
    "familyName": null,
    "service": null,
    */
  }

  validateDeviceIp(host) {
    try {
      const http = require('http');

      const options = {
        host: host,
        path: '/mesh_info',

        headers: {},
      };

      http.request(options, (response) => {
        let str = '';

        //another chunk of data has been received, so append it to `str`
        response.on('data', (chunk) => {
          str += chunk;
        });

        //the whole response has been received, so we just print it out here
        response.on('end', () => {

          const data = JSON.parse(str);

          this.log.info(data, typeof data, response.headers);

          if(data && typeof data === 'object' && data.status_code === 0) {
            this.discoveredDevice({
              host: host,
              id: response.headers['mesh-node-num'],
              mac: response.headers['mesh-node-mac'],
            });
          }
        });
      }).end();
    } catch(e) {
      this.log.warn('threw error when looking for esp32_mesh.local');
    }
  }

  discoveredDevice(device) {
    this.log.info('discovered device', device);

    const uuid = this.api.hap.uuid.generate(device.mac);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      existingAccessory.context.device = device;
      this.api.updatePlatformAccessories([existingAccessory]);

      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      //this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);

      new EcocontrolAccessory(this, existingAccessory);

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // remove platform accessories when no longer present
      //this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
      // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', device.mac);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.host, uuid);

      //const accessory = new this.api.platformAccessory(device.host, device.id, device.mac);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new EcocontrolAccessory(this, accessory);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

  }
}