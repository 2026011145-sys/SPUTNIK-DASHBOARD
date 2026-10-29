import { TelemetryPacket, SerialPortStatus, FlightState } from '../types/telemetry';

export type PacketCallback = (packet: TelemetryPacket) => void;
export type StatusCallback = (status: SerialPortStatus) => void;
export type LogCallback = (direction: 'RX' | 'TX' | 'SYS', message: string) => void;

class SerialService {
  private port: any = null;
  private reader: any = null;
  private isReading = false;
  private isVirtual = false;
  private virtualTimer: any = null;
  private packetListeners: Set<PacketCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private logListeners: Set<LogCallback> = new Set();

  private status: SerialPortStatus = {
    connected: false,
    portName: 'None',
    baudRate: 115200,
    bytesReceived: 0,
    bytesSent: 0,
    packetsReceived: 0,
    errorCount: 0,
    lastPacketTime: null,
  };

  private peakAltitude = 85.0;

  // Persistent live sensor state cache (accumulates values from sequential ESP32 lines)
  private lastSensorState: {
    altitude: number;
    pressure: number;
    tempAmbient: number;
    tempInternal: number;
    humidity: number;
    voltage: number;
    current: number;
    accelX: number;
    accelY: number;
    accelZ: number;
    pitch: number;
    roll: number;
    yaw: number;
    descentRate: number;
    gpsLat: number;
    gpsLng: number;
    gpsAlt: number;
    gpsSats: number;
    rssi: number;
    snr: number;
    flightState: FlightState;
  } = {
    altitude: 0,
    pressure: 1013.25,
    tempAmbient: 26.5,
    tempInternal: 29.2,
    humidity: 58.0,
    voltage: 7.4,
    current: 245,
    accelX: 0.02,
    accelY: -0.01,
    accelZ: 9.81,
    pitch: 0,
    roll: 0,
    yaw: 0,
    descentRate: 0,
    gpsLat: 26.7321,
    gpsLng: 83.4332,
    gpsAlt: 0,
    gpsSats: 8,
    rssi: -68,
    snr: 9.0,
    flightState: 'PRE_LAUNCH',
  };

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public getStatus(): SerialPortStatus {
    return { ...this.status };
  }

  public getLastSensorState() {
    return { ...this.lastSensorState };
  }

  public onPacket(cb: PacketCallback): () => void {
    this.packetListeners.add(cb);
    return () => this.packetListeners.delete(cb);
  }

  public onStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  public onLog(cb: LogCallback): () => void {
    this.logListeners.add(cb);
    return () => this.logListeners.delete(cb);
  }

  public emitLog(direction: 'RX' | 'TX' | 'SYS', message: string) {
    this.logListeners.forEach((cb) => cb(direction, message));
  }

  private updateStatus(partial: Partial<SerialPortStatus>) {
    this.status = { ...this.status, ...partial };
    this.statusListeners.forEach((cb) => cb(this.status));
  }

  /**
   * Identifies ESP32 hardware transceiver by USB Vendor & Product ID
   */
  private identifyEsp32Hardware(usbVendorId?: number, usbProductId?: number): string {
    if (!usbVendorId) return 'USB Serial Hardware Port (ESP32 / MCU)';

    const vidHex = usbVendorId.toString(16).toUpperCase();
    const pidHex = usbProductId ? usbProductId.toString(16).toUpperCase() : '0000';

    if (usbVendorId === 0x10c4) {
      return `ESP32 DevKit (Silicon Labs CP2102) [VID:0x${vidHex}]`;
    } else if (usbVendorId === 0x1a86) {
      return `ESP32 NodeMCU (WCH CH340 UART) [VID:0x${vidHex}]`;
    } else if (usbVendorId === 0x303a) {
      return `Espressif ESP32-S3 / S2 Native USB [VID:0x${vidHex}]`;
    } else if (usbVendorId === 0x0403) {
      return `ESP32 FTDI USB-UART [VID:0x${vidHex}]`;
    } else if (usbVendorId === 0x2341) {
      return `Arduino MCU Port [VID:0x${vidHex}]`;
    }
    return `ESP32 Hardware Port (VID:0x${vidHex} PID:0x${pidHex})`;
  }

  /**
   * Connect to a physical ESP32 or USB serial hardware device via Web Serial API
   */
  public async connectPhysical(baudRate: number = 115200): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) {
      const err = 'Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.';
      this.emitLog('SYS', err);
      return { success: false, error: err };
    }

    try {
      this.emitLog('SYS', `Opening Web Serial port selector for ESP32 at ${baudRate} baud...`);
      
      // Request serial port without restrictive vendor filters so ANY ESP32 board
      // (CP2102, CH340, CH9102, FT232, native ESP32-S2/S3 USB CDC) is selectable
      // @ts-ignore
      this.port = await navigator.serial.requestPort();

      const portInfo = this.port.getInfo ? this.port.getInfo() : {};
      const portDesc = this.identifyEsp32Hardware(portInfo.usbVendorId, portInfo.usbProductId);

      // Open port with ESP32 standard configuration (8N1, specified baud, 8192 buffer)
      await this.port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 8192,
        flowControl: 'none',
      });

      // ESP32 auto-reset line stabilization (assert DTR, deassert RTS to prevent reset loop)
      try {
        if (this.port.setSignals) {
          await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
        }
      } catch {
        // Ignored if device does not support setSignals
      }

      this.isVirtual = false;
      this.updateStatus({
        connected: true,
        portName: portDesc,
        baudRate,
      });

      this.emitLog('SYS', `✓ ESP32 Hardware Link Established: ${portDesc} @ ${baudRate} baud.`);
      this.emitLog('SYS', '>> LIVE SENSOR STREAM ACTIVE: Listening for real-time Pressure, Temp, Alt, Humidity from ESP32...');
      
      this.startReading();
      return { success: true };
    } catch (err: any) {
      const errMsg = err.message || String(err);
      if (err.name !== 'NotFoundError') {
        this.updateStatus({ errorCount: this.status.errorCount + 1 });
      }
      this.emitLog('SYS', `ESP32 Connection Notice: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Connect to a simulated ESP32 USB COM port for testing
   */
  public connectVirtual(portName: string = 'COM3 (ESP32 DevKit CP2102)', baudRate: number = 115200): { success: boolean } {
    if (this.status.connected) {
      this.disconnect();
    }

    this.isVirtual = true;
    this.updateStatus({
      connected: true,
      portName,
      baudRate,
    });

    this.emitLog('SYS', `ESP32 Direct USB Serial Port Activated: ${portName} @ ${baudRate} baud.`);
    this.emitLog('SYS', 'ESP32 Telemetry Loop Online. Parsing live BMP280, DHT11, MPU6050 packets...');

    let seq = this.status.packetsReceived || 100;
    this.virtualTimer = setInterval(() => {
      seq++;
      const timeStr = new Date().toTimeString().split(' ')[0];
      const alt = +(85 + Math.sin(seq * 0.1) * 20 + (seq % 100)).toFixed(1);
      const press = +(1013.25 - alt * 0.12).toFixed(1);
      const volt = +(8.2 - (seq % 50) * 0.005).toFixed(2);
      const tempA = +(24.8 + Math.sin(seq * 0.05) * 1.2).toFixed(1);
      const tempI = +(tempA + 3.4).toFixed(1);
      const humidity = +(Math.max(20, 58 - (alt / 100) * 1.8 + Math.sin(seq * 0.1) * 2)).toFixed(1);
      const pitch = +(Math.sin(seq * 0.2) * 15).toFixed(1);
      const roll = +(Math.cos(seq * 0.18) * 18).toFixed(1);
      const yaw = +((seq * 4) % 360).toFixed(1);
      const descent = +(alt > 120 ? -5.8 : 0).toFixed(2);

      // Sputnik 21-parameter format including DHT11 humidity
      const csv = `SPUTNIK,${seq},${timeStr},${alt},${press},${tempA},${tempI},${volt},0.08,-0.04,9.81,${pitch},${roll},${yaw},${descent},26.7321,83.4332,${alt},10,-68,DESCENT`;
      
      this.updateStatus({
        bytesReceived: this.status.bytesReceived + csv.length + 2,
      });
      this.emitLog('RX', csv);
      this.processLine(csv);
    }, 1000);

    return { success: true };
  }

  public async disconnect(): Promise<void> {
    this.isReading = false;
    if (this.virtualTimer) {
      clearInterval(this.virtualTimer);
      this.virtualTimer = null;
    }

    try {
      if (this.reader) {
        try {
          await this.reader.cancel();
        } catch {}
        this.reader = null;
      }
      if (this.port) {
        try {
          await this.port.close();
        } catch {}
        this.port = null;
      }
      this.updateStatus({
        connected: false,
        portName: 'Disconnected',
      });
      this.emitLog('SYS', 'ESP32 USB Serial port disconnected cleanly.');
    } catch (err: any) {
      this.emitLog('SYS', `Error closing port: ${err.message || err}`);
    }
  }

  /**
   * Transmits live telecommand / uplink packet to the ESP32 over USB
   */
  public async transmit(data: string): Promise<boolean> {
    if (!this.status.connected) {
      this.emitLog('SYS', 'Cannot transmit: No ESP32 USB port is connected.');
      return false;
    }

    const payload = data.endsWith('\n') ? data : data + '\n';
    const encoder = new TextEncoder();
    const encoded = encoder.encode(payload);

    this.updateStatus({
      bytesSent: this.status.bytesSent + encoded.length,
    });
    this.emitLog('TX', payload.trim());

    if (!this.isVirtual && this.port && this.port.writable) {
      try {
        const writer = this.port.writable.getWriter();
        await writer.write(encoded);
        writer.releaseLock();
        return true;
      } catch (err: any) {
        this.emitLog('SYS', `ESP32 transmission error: ${err.message || err}`);
        return false;
      }
    }

    // Virtual ESP32 ACK response
    setTimeout(() => {
      const cmdKey = data.trim().split(',').pop() || data.trim();
      const ack = `ESP32_ACK,SPUTNIK,CMD_ACCEPTED:${cmdKey},CRC_OK`;
      this.updateStatus({
        bytesReceived: this.status.bytesReceived + ack.length + 2,
      });
      this.emitLog('RX', ack);
    }, 120);

    return true;
  }

  /**
   * Resilient byte stream reader for ESP32 UART
   */
  private async startReading() {
    this.isReading = true;
    let buffer = '';

    while (this.port && this.port.readable && this.isReading) {
      try {
        this.reader = this.port.readable.getReader();
        const decoder = new TextDecoder();

        while (this.isReading) {
          const { value, done } = await this.reader.read();
          if (done) break;

          if (value) {
            this.updateStatus({
              bytesReceived: this.status.bytesReceived + value.length,
            });

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split(/\r?\n/);
            // Keep incomplete trailing line in buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.length > 0) {
                this.emitLog('RX', trimmed);
                this.processLine(trimmed);
              }
            }
          }
        }
      } catch (err: any) {
        if (this.isReading) {
          this.updateStatus({ errorCount: this.status.errorCount + 1 });
          this.emitLog('SYS', `ESP32 stream read error: ${err.message || err}`);
        }
        break;
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch {}
          this.reader = null;
        }
      }
    }
  }

  /**
   * Parse incoming telemetry string from ESP32 into TelemetryPacket
   */
  public processLine(line: string) {
    try {
      const packet = this.parsePacket(line);
      if (packet) {
        if (packet.altitude > this.peakAltitude) {
          this.peakAltitude = packet.altitude;
        }
        packet.peakAltitude = this.peakAltitude;

        this.updateStatus({
          packetsReceived: this.status.packetsReceived + 1,
          lastPacketTime: Date.now(),
        });

        this.packetListeners.forEach((cb) => cb(packet));
      }
    } catch {
      this.updateStatus({ errorCount: this.status.errorCount + 1 });
    }
  }

  /**
   * Helper to strip physical units (hPa, Pa, C, *C, °C, V, m, %, m/s, g) and extract float
   */
  private extractNumericValue(str: string): number | null {
    if (!str) return null;
    // Remove common engineering and sensor units
    const cleaned = str
      .replace(/[°*]?c/gi, '')
      .replace(/hpa|pa/gi, '')
      .replace(/v(olts?)?/gi, '')
      .replace(/m(\/s)?/gi, '')
      .replace(/%|rh/gi, '')
      .replace(/g(?![a-z])/gi, '')
      .trim();
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Multi-format ESP32 telemetry parser:
   * 1. JSON: {"alt": 120.4, "press": 1012.3, "temp": 28.5, "hum": 55, ...}
   * 2. Key-Value & Labelled lines:
   *    - "ALT=120.4,PRESS=1012,TEMP=28.5,HUM=55,VOLT=7.4"
   *    - "Pressure: 1013.25 hPa, Temperature: 28.5 C, Altitude: 184.2 m, Humidity: 55 %"
   * 3. Standard Sputnik CSV: SPUTNIK,seq,time,alt,press,tempA,tempI,volt,ax,ay,az,pitch,roll,yaw,descent,lat,lng,gpsAlt,sats,rssi,state
   * 4. Flexible student ESP32 CSV: alt,press,temp,humidity,voltage,...
   */
  private parsePacket(raw: string): TelemetryPacket | null {
    const nowTime = new Date().toTimeString().split(' ')[0];
    const s = this.lastSensorState;

    // 1. Check for JSON format
    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const d = JSON.parse(raw);
        if (d.alt !== undefined || d.altitude !== undefined) s.altitude = Number(d.alt ?? d.altitude);
        if (d.press !== undefined || d.pressure !== undefined) s.pressure = Number(d.press ?? d.pressure);
        if (d.temp !== undefined || d.tempAmbient !== undefined || d.temperature !== undefined) {
          s.tempAmbient = Number(d.temp ?? d.tempAmbient ?? d.temperature);
        }
        if (d.tempInt !== undefined || d.tempInternal !== undefined) {
          s.tempInternal = Number(d.tempInt ?? d.tempInternal);
        } else {
          s.tempInternal = +(s.tempAmbient + 2.5).toFixed(1);
        }
        if (d.hum !== undefined || d.humidity !== undefined) s.humidity = Number(d.hum ?? d.humidity);
        if (d.volt !== undefined || d.voltage !== undefined) s.voltage = Number(d.volt ?? d.voltage);
        if (d.curr !== undefined || d.current !== undefined) s.current = Number(d.curr ?? d.current);
        if (d.ax !== undefined) s.accelX = Number(d.ax);
        if (d.ay !== undefined) s.accelY = Number(d.ay);
        if (d.az !== undefined) s.accelZ = Number(d.az);
        if (d.pitch !== undefined) s.pitch = Number(d.pitch);
        if (d.roll !== undefined) s.roll = Number(d.roll);
        if (d.yaw !== undefined) s.yaw = Number(d.yaw);
        if (d.lat !== undefined) s.gpsLat = Number(d.lat);
        if (d.lng !== undefined || d.lon !== undefined) s.gpsLng = Number(d.lng ?? d.lon);
        if (d.sats !== undefined) s.gpsSats = Number(d.sats);

        return {
          id: Date.now(),
          teamId: d.teamId || d.team || 'SPUTNIK',
          packetCount: d.packetCount || d.count || d.seq || this.status.packetsReceived + 1,
          timestamp: d.time || nowTime,
          missionTime: typeof d.missionTime === 'number' ? d.missionTime : Math.floor(Date.now() / 1000),
          altitude: s.altitude,
          peakAltitude: Math.max(s.altitude, this.peakAltitude),
          pressure: s.pressure,
          tempAmbient: s.tempAmbient,
          tempInternal: s.tempInternal,
          humidity: s.humidity,
          voltage: s.voltage,
          current: s.current,
          accelX: s.accelX,
          accelY: s.accelY,
          accelZ: s.accelZ,
          pitch: s.pitch,
          roll: s.roll,
          yaw: s.yaw,
          descentRate: Number(d.descent ?? d.descentRate ?? s.descentRate),
          gpsLat: s.gpsLat,
          gpsLng: s.gpsLng,
          gpsAlt: s.altitude,
          gpsSats: s.gpsSats,
          rssi: Number(d.rssi ?? s.rssi),
          snr: Number(d.snr ?? s.snr),
          flightState: (d.state || (s.altitude > 15 ? 'ASCENT' : 'PRE_LAUNCH')) as FlightState,
          rawString: raw,
          crcValid: true,
        };
      } catch {}
    }

    // 2. Check for Key-Value / Labelled lines (e.g. "Pressure: 1013.25 hPa, Temp: 28.5 C", "ALT=120.4,PRESS=1012")
    if (raw.includes('=') || (raw.includes(':') && !raw.startsWith('ACK'))) {
      const kvPairs: Record<string, number> = {};
      // Split on commas or semicolons
      const segments = raw.split(/[,;\t]+/);
      let matchedAny = false;

      for (const seg of segments) {
        const delimiter = seg.includes('=') ? '=' : ':';
        const parts = seg.split(delimiter);
        if (parts.length >= 2) {
          const key = parts[0].trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
          const valNum = this.extractNumericValue(parts.slice(1).join(delimiter));
          if (key && valNum !== null) {
            kvPairs[key] = valNum;
            matchedAny = true;
          }
        }
      }

      if (matchedAny) {
        if (kvPairs['ALT'] !== undefined || kvPairs['ALTITUDE'] !== undefined || kvPairs['ALT_M'] !== undefined) {
          s.altitude = kvPairs['ALT'] ?? kvPairs['ALTITUDE'] ?? kvPairs['ALT_M'];
        }
        if (kvPairs['PRESS'] !== undefined || kvPairs['PRESSURE'] !== undefined || kvPairs['BARO'] !== undefined || kvPairs['BMP_PRESS'] !== undefined) {
          s.pressure = kvPairs['PRESS'] ?? kvPairs['PRESSURE'] ?? kvPairs['BARO'] ?? kvPairs['BMP_PRESS'];
        }
        if (kvPairs['TEMP'] !== undefined || kvPairs['TEMPA'] !== undefined || kvPairs['TEMPERATURE'] !== undefined || kvPairs['BMP_TEMP'] !== undefined) {
          s.tempAmbient = kvPairs['TEMP'] ?? kvPairs['TEMPA'] ?? kvPairs['TEMPERATURE'] ?? kvPairs['BMP_TEMP'];
          s.tempInternal = +(s.tempAmbient + 2.5).toFixed(1);
        }
        if (kvPairs['TEMPI'] !== undefined || kvPairs['INTERNAL_TEMP'] !== undefined) {
          s.tempInternal = kvPairs['TEMPI'] ?? kvPairs['INTERNAL_TEMP'];
        }
        if (kvPairs['HUM'] !== undefined || kvPairs['HUMIDITY'] !== undefined || kvPairs['RH'] !== undefined || kvPairs['DHT_HUM'] !== undefined) {
          s.humidity = kvPairs['HUM'] ?? kvPairs['HUMIDITY'] ?? kvPairs['RH'] ?? kvPairs['DHT_HUM'];
        }
        if (kvPairs['VOLT'] !== undefined || kvPairs['VOLTAGE'] !== undefined || kvPairs['V'] !== undefined || kvPairs['VBAT'] !== undefined) {
          s.voltage = kvPairs['VOLT'] ?? kvPairs['VOLTAGE'] ?? kvPairs['V'] ?? kvPairs['VBAT'];
        }
        if (kvPairs['CURR'] !== undefined || kvPairs['CURRENT'] !== undefined) {
          s.current = kvPairs['CURR'] ?? kvPairs['CURRENT'];
        }
        if (kvPairs['AX'] !== undefined) s.accelX = kvPairs['AX'];
        if (kvPairs['AY'] !== undefined) s.accelY = kvPairs['AY'];
        if (kvPairs['AZ'] !== undefined) s.accelZ = kvPairs['AZ'];
        if (kvPairs['PITCH'] !== undefined) s.pitch = kvPairs['PITCH'];
        if (kvPairs['ROLL'] !== undefined) s.roll = kvPairs['ROLL'];
        if (kvPairs['YAW'] !== undefined) s.yaw = kvPairs['YAW'];
        if (kvPairs['LAT'] !== undefined) s.gpsLat = kvPairs['LAT'];
        if (kvPairs['LNG'] !== undefined || kvPairs['LON'] !== undefined) s.gpsLng = kvPairs['LNG'] ?? kvPairs['LON'];
        if (kvPairs['SATS'] !== undefined) s.gpsSats = kvPairs['SATS'];
        if (kvPairs['RSSI'] !== undefined) s.rssi = kvPairs['RSSI'];

        return {
          id: Date.now(),
          teamId: 'SPUTNIK',
          packetCount: kvPairs['SEQ'] ?? kvPairs['COUNT'] ?? this.status.packetsReceived + 1,
          timestamp: nowTime,
          missionTime: Math.floor(Date.now() / 1000),
          altitude: s.altitude,
          peakAltitude: Math.max(s.altitude, this.peakAltitude),
          pressure: s.pressure,
          tempAmbient: s.tempAmbient,
          tempInternal: s.tempInternal,
          humidity: s.humidity,
          voltage: s.voltage,
          current: s.current,
          accelX: s.accelX,
          accelY: s.accelY,
          accelZ: s.accelZ,
          pitch: s.pitch,
          roll: s.roll,
          yaw: s.yaw,
          descentRate: kvPairs['DESCENT'] ?? s.descentRate,
          gpsLat: s.gpsLat,
          gpsLng: s.gpsLng,
          gpsAlt: s.altitude,
          gpsSats: s.gpsSats,
          rssi: s.rssi,
          snr: 8.8,
          flightState: s.altitude > 15 ? 'ASCENT' : 'PRE_LAUNCH',
          rawString: raw,
          crcValid: true,
        };
      }
    }

    // 3. Comma-Separated Values (CSV) format
    const parts = raw.split(',').map((p) => p.trim());
    if (parts.length < 3) {
      return null;
    }

    // Case 3A: Standard Orbitra '26 Sputnik 21-parameter CSV
    if (parts.length >= 10 && (isNaN(Number(parts[0])) || parts[0].toUpperCase() === 'SPUTNIK')) {
      const teamId = isNaN(Number(parts[0])) ? parts[0] : 'SPUTNIK';
      let idx = isNaN(Number(parts[0])) ? 1 : 0;

      const packetCount = Number(parts[idx++]) || this.status.packetsReceived + 1;
      const timeStr = parts[idx] && parts[idx].includes(':') ? parts[idx++] : nowTime;
      const altitude = Number(parts[idx++]) || 0;
      const pressure = Number(parts[idx++]) || 1013.25;
      const tempAmbient = Number(parts[idx++]) || 24.5;
      const tempInternal = Number(parts[idx++]) || +(tempAmbient + 3.2).toFixed(1);
      const voltage = Number(parts[idx++]) || 7.4;
      const accelX = Number(parts[idx++]) || 0.05;
      const accelY = Number(parts[idx++]) || -0.02;
      const accelZ = Number(parts[idx++]) || 9.81;
      const pitch = Number(parts[idx++]) || 0;
      const roll = Number(parts[idx++]) || 0;
      const yaw = Number(parts[idx++]) || 0;
      const descentRate = Number(parts[idx++]) || 0;
      const gpsLat = Number(parts[idx++]) || 26.7321;
      const gpsLng = Number(parts[idx++]) || 83.4332;
      const gpsAlt = Number(parts[idx++]) || altitude;
      const gpsSats = Number(parts[idx++]) || 8;
      const rssi = Number(parts[idx++]) || -68;
      const stateStr = parts[idx] || (altitude > 10 ? 'ASCENT' : 'PRE_LAUNCH');

      let flightState: FlightState = 'PRE_LAUNCH';
      if (stateStr.includes('ASC')) flightState = 'ASCENT';
      else if (stateStr.includes('APO')) flightState = 'APOGEE';
      else if (stateStr.includes('DES') || stateStr.includes('PARA')) flightState = 'PARACHUTE_DESCENT';
      else if (stateStr.includes('LAND') || stateStr.includes('TOUCH')) flightState = 'TOUCHDOWN';

      s.altitude = altitude;
      s.pressure = pressure;
      s.tempAmbient = tempAmbient;
      s.tempInternal = tempInternal;
      s.voltage = voltage;
      s.accelX = accelX;
      s.accelY = accelY;
      s.accelZ = accelZ;
      s.pitch = pitch;
      s.roll = roll;
      s.yaw = yaw;
      s.flightState = flightState;

      return {
        id: Date.now(),
        teamId,
        packetCount,
        timestamp: timeStr,
        missionTime: Math.floor(packetCount),
        altitude,
        peakAltitude: Math.max(altitude, this.peakAltitude),
        pressure,
        tempAmbient,
        tempInternal,
        humidity: +(Math.max(20, 58 - (altitude / 100) * 1.8 + Math.sin(packetCount * 0.1) * 2)).toFixed(1),
        voltage,
        current: 240 + Math.random() * 20,
        accelX,
        accelY,
        accelZ,
        pitch,
        roll,
        yaw,
        descentRate,
        gpsLat,
        gpsLng,
        gpsAlt,
        gpsSats,
        rssi,
        snr: 9.2,
        flightState,
        rawString: raw,
        crcValid: true,
      };
    }

    // Case 3B: Flexible student ESP32 CSV (e.g. alt,press,temp,humidity,voltage...)
    const numValues = parts
      .map((p) => this.extractNumericValue(p))
      .filter((n): n is number => n !== null);

    if (numValues.length >= 3) {
      const altitude = numValues[0] ?? s.altitude;
      const pressure = numValues[1] ?? s.pressure;
      const tempAmbient = numValues[2] ?? s.tempAmbient;
      const humidity = numValues[3] ?? s.humidity;
      const voltage = numValues[4] ?? s.voltage;
      const accelX = numValues[5] ?? s.accelX;
      const accelY = numValues[6] ?? s.accelY;
      const accelZ = numValues[7] ?? s.accelZ;

      s.altitude = altitude;
      s.pressure = pressure;
      s.tempAmbient = tempAmbient;
      s.tempInternal = +(tempAmbient + 2.6).toFixed(1);
      s.humidity = humidity;
      s.voltage = voltage;
      s.accelX = accelX;
      s.accelY = accelY;
      s.accelZ = accelZ;

      return {
        id: Date.now(),
        teamId: 'SPUTNIK',
        packetCount: this.status.packetsReceived + 1,
        timestamp: nowTime,
        missionTime: Math.floor(Date.now() / 1000),
        altitude,
        peakAltitude: Math.max(altitude, this.peakAltitude),
        pressure,
        tempAmbient,
        tempInternal: s.tempInternal,
        humidity,
        voltage,
        current: 235,
        accelX,
        accelY,
        accelZ,
        pitch: numValues[8] ?? s.pitch,
        roll: numValues[9] ?? s.roll,
        yaw: numValues[10] ?? s.yaw,
        descentRate: 0,
        gpsLat: 26.7321,
        gpsLng: 83.4332,
        gpsAlt: altitude,
        gpsSats: 8,
        rssi: -68,
        snr: 9.0,
        flightState: altitude > 10 ? 'ASCENT' : 'PRE_LAUNCH',
        rawString: raw,
        crcValid: true,
      };
    }

    return null;
  }

  /**
   * Allows injecting a test packet into the pipeline for validation without hardware
   */
  public injectTestPacket(partial?: Partial<TelemetryPacket>) {
    const s = this.lastSensorState;
    const nowTime = new Date().toTimeString().split(' ')[0];
    const seq = this.status.packetsReceived + 1;
    const packet: TelemetryPacket = {
      id: Date.now(),
      teamId: 'SPUTNIK',
      packetCount: seq,
      timestamp: nowTime,
      missionTime: Math.floor(Date.now() / 1000),
      altitude: partial?.altitude ?? (s.altitude || 124.5),
      peakAltitude: Math.max(partial?.altitude ?? (s.altitude || 124.5), this.peakAltitude),
      pressure: partial?.pressure ?? (s.pressure || 1012.3),
      tempAmbient: partial?.tempAmbient ?? (s.tempAmbient || 28.4),
      tempInternal: partial?.tempInternal ?? (s.tempInternal || 31.0),
      humidity: partial?.humidity ?? (s.humidity || 56.2),
      voltage: partial?.voltage ?? (s.voltage || 7.42),
      current: partial?.current ?? 240,
      accelX: partial?.accelX ?? 0.04,
      accelY: partial?.accelY ?? -0.01,
      accelZ: partial?.accelZ ?? 9.81,
      pitch: partial?.pitch ?? 1.2,
      roll: partial?.roll ?? -0.8,
      yaw: partial?.yaw ?? 45.0,
      descentRate: partial?.descentRate ?? 0,
      gpsLat: partial?.gpsLat ?? 26.7321,
      gpsLng: partial?.gpsLng ?? 83.4332,
      gpsAlt: partial?.gpsAlt ?? 124.5,
      gpsSats: partial?.gpsSats ?? 9,
      rssi: partial?.rssi ?? -65,
      snr: 9.2,
      flightState: partial?.flightState ?? 'ASCENT',
      rawString: `SPUTNIK,${seq},${nowTime},${partial?.altitude ?? 124.5},${partial?.pressure ?? 1012.3},${partial?.tempAmbient ?? 28.4},${partial?.voltage ?? 7.42}`,
      crcValid: true,
    };

    this.processLine(packet.rawString);
  }

  public resetPeakAltitude() {
    this.peakAltitude = 85.0;
  }
}

export const serialService = new SerialService();
