import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { callbackify } from 'util';
import { isSet } from 'util/types';
import { ExampleHomebridgePlatform } from './platform';

const http = require('http');

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class EcocontrolAccessory {

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Brightness: 100,
  };

  private service: Service;
  private log;

  public host;
  public id;
  public mac;

  public state = {
    RoomTemperature: null,
    SetpointTemperature: null,
  };

  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.platform = platform;
    this.log = platform.log;

    this.host = accessory.context.device.host;
    this.id = accessory.context.device.id;
    this.mac = accessory.context.device.mac;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SunnyHeat')
      .setCharacteristic(this.platform.Characteristic.Model, 'Panel')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    const serviceType = this.platform.Service.Thermostat;
    this.service = this.accessory.getService(serviceType) || this.accessory.addService(serviceType);

    this.registerServices();

    this.startDataSync();
  }

  startDataSync() {
    this.syncData();

    setInterval(() => {
      this.syncData();
    }, 1000 * 60 * 5);
  }

  syncData() {
    this.fetchDetails();
    this.fetchState();
  }

  registerServices() {
    // create handlers for required characteristics
    this.service.setCharacteristic(this.platform.Characteristic.Name, 'infrared panel');
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setValue(this.platform.Characteristic.TargetHeatingCoolingState.HEAT)
      .setProps({
        minValue: this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
        maxValue: this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
      });

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).setProps({
      minValue: 15,
      maxValue: 30,
    });

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).setProps({
      minValue: 15,
      maxValue: 30,
    });


    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .on('get', this.handleActiveGet.bind(this))
      .on('set', this.handleActiveSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .on('get', this.handleCurrentHeaterCoolerStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .on('get', this.handleTargetHeaterCoolerStateGet.bind(this))
      .on('set', this.handleTargetHeaterCoolerStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));


    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('get', this.handleTargetTemperatureGet.bind(this))
      .on('set', this.handleTargetTemperatureSet.bind(this));

  }




  //Get active state (on or off)
  handleActiveGet(callback) {
    this.log.debug('Triggered GET Active');

    const currentValue = 1;

    callback(null, currentValue);
  }

  handleActiveSet(value, callback) {
    this.log.debug('Triggered SET Active:', value);

    callback(null);
  }



  //get target state
  handleTargetHeaterCoolerStateGet(callback) {
    this.log.debug('Triggered GET TargetHeaterCoolerState');

    const currentValue = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;

    callback(null, currentValue);
  }

  //set target state
  handleTargetHeaterCoolerStateSet(value, callback) {
    this.log.debug('Triggered SET TargetHeaterCoolerState:', value);

    callback(null);
  }

  //get target temperature
  handleTargetTemperatureGet(callback) {
    this.log.debug('Triggered GET TargetTemperatureGet');

    let currentValue = 15;
    if(this.state.SetpointTemperature && typeof this.state.SetpointTemperature === 'number') {
      currentValue = this.state.SetpointTemperature;
    }

    callback(null, currentValue);
  }

  //set target temperature
  handleTargetTemperatureSet(value, callback) {
    this.log.debug('Triggered SET TargetTemperatureSet:', value);

    //TODO set SetpointTemperature
    this.setSetpointTemperature(value);

    callback(null);
  }



  //get  current state
  handleCurrentHeaterCoolerStateGet(callback) {
    this.log.debug('Triggered GET CurrentHeaterCoolerState');

    const currentValue = this.currentHeaterCoolerState();

    callback(null, currentValue);
  }

  currentHeaterCoolerState(): number {
    //idle or heating
    return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
  }


  //
  handleCurrentTemperatureGet(callback) {
    this.log.debug('Triggered GET CurrentTemperature');

    const currentValue = this.state.RoomTemperature;

    callback(null, currentValue);
  }


  syncState() {
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).updateValue(this.state.RoomTemperature);
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).updateValue(this.state.RoomTemperature);

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).updateValue(this.state.RoomTemperature);
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).updateValue(this.state.RoomTemperature);
  }


  async setSetpointTemperature(setPointTemperature) {
    this.state.SetpointTemperature = setPointTemperature;

    const response = await this.post(this.host, '/device_request', {
      'request': 'set_status',
      'characteristics': [{
        'value': setPointTemperature,
        'cid': 19,
      }],
    });
  }

  async fetchDetails() {
    const response = await this.post(this.host, '/device_request', {
      'start': 1,
      'request': 'getDeviceData',
    });
  }


  async fetchState() {
    const response = await this.post(this.host, '/device_request', {
      'request': 'get_device_info',
    });

    if(response && typeof response === 'object' && typeof response.characteristics === 'object') {
      response.characteristics.forEach((characteristic) => {
        if(typeof this.state[characteristic.name] !== 'undefined') {
          this.state[characteristic.name] = characteristic.value;
        }
      });
    }

    this.syncState();
  }

  post(host, url, data): {[key: string]: any} {
    return new Promise((resolve, reject) => {
      const post_data = JSON.stringify(data);

      const options = {
        host: host,
        path: url,
        method: 'POST',

        headers: {
          'Mesh-Node-Mac': this.mac,
          'Mesh-Node-Num': this.id,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(post_data),
        },
      };

      const request = http.request(options, (response) => {
        let str = '';

        //another chunk of data has been received, so append it to `str`
        response.on('data', (chunk) => {
          str += chunk;
        });

        //the whole response has been received, so we just print it out here
        response.on('end', () => {

          const data = JSON.parse(str);

          //this.platform.log.info(data, typeof data, response.headers);

          resolve(data);
        });
      });

      request.write(post_data);

      request.end();
    });
  }
}
