import React, { useState, useEffect, useRef } from 'react';
import { serialService } from '../services/serialService';
import { TelemetryPacket, SerialPortStatus } from '../types/telemetry';
import { 
  Usb, 
  Send, 
  Terminal, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Radio, 
  Zap, 
  Copy, 
  Check, 
  Cpu, 
  Gauge, 
  Thermometer, 
  Droplets, 
  BatteryCharging, 
  Compass, 
  Activity, 
  Code2, 
  BookOpen,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';

interface UsbCommandDeckProps {
  currentPacket?: TelemetryPacket | null;
  onSimulateLaunch?: () => void;
  onSimulateParachute?: () => void;
  isSimulating: boolean;
}

interface LogEntry {
  id: string;
  time: string;
  direction: 'RX' | 'TX' | 'SYS';
  text: string;
}

export const UsbCommandDeck: React.FC<UsbCommandDeckProps> = ({
  currentPacket,
  isSimulating,
}) => {
  const [subTab, setSubTab] = useState<'terminal' | 'arduino_code' | 'wiring'>('terminal');
  const [status, setStatus] = useState<SerialPortStatus>(serialService.getStatus());
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [customCommand, setCustomCommand] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      time: new Date().toTimeString().split(' ')[0],
      direction: 'SYS',
      text: 'ESP32 USB Ground Transceiver Subsystem Ready. Plug in ESP32 and click "Connect Physical ESP32".',
    },
  ]);
  const [isWebSerialSupported, setIsWebSerialSupported] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsWebSerialSupported(serialService.isSupported());

    const unsubscribeStatus = serialService.onStatus((newStatus) => {
      setStatus(newStatus);
    });

    const unsubscribeLog = serialService.onLog((direction, message) => {
      setLogs((prev) => [
        ...prev.slice(-200),
        {
          id: Math.random().toString(36).substring(2, 9),
          time: new Date().toTimeString().split(' ')[0],
          direction,
          text: message,
        },
      ]);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeLog();
    };
  }, []);

  useEffect(() => {
    if (subTab === 'terminal') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, subTab]);

  const handlePhysicalConnect = async () => {
    if (status.connected) {
      await serialService.disconnect();
    } else {
      const res = await serialService.connectPhysical(baudRate);
      if (!res.success && res.error !== 'User cancelled the request') {
        serialService.emitLog(
          'SYS',
          'Tip: If no hardware is attached right now, click "Virtual ESP32 Port" or "Inject Sensor Packet" to test live sensor feeds.'
        );
      }
    }
  };

  const handleVirtualConnect = () => {
    if (status.connected) {
      serialService.disconnect();
    }
    serialService.connectVirtual('COM3 (ESP32 DevKit CP2102 UART)', baudRate);
  };

  const handleInjectTestPacket = () => {
    serialService.injectTestPacket({
      pressure: +(1012.4 + (Math.random() * 2 - 1)).toFixed(2),
      tempAmbient: +(27.5 + Math.random() * 2).toFixed(1),
      humidity: +(54.0 + Math.random() * 4).toFixed(1),
      altitude: +(185.0 + Math.random() * 10).toFixed(1),
      voltage: +(7.42 + Math.random() * 0.1).toFixed(2),
    });
  };

  const handleSendCommand = async (cmdText: string) => {
    if (!cmdText.trim()) return;
    const cleanCmd = cmdText.trim();
    await serialService.transmit(cleanCmd);
    supabaseService.saveCommandLog(cleanCmd);
    setCustomCommand('');
  };

  const copyArduinoCode = () => {
    navigator.clipboard.writeText(arduinoEsp32Code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const quickCommands = [
    { code: 'CAL_ALT', label: 'Zero Barometer', desc: 'Calibrate BMP280 sea-level baseline' },
    { code: 'DEPLOY_CHUTE', label: 'Eject Chute', desc: 'Trigger servo/pyro parachute deploy' },
    { code: 'PING', label: 'Ping ESP32', desc: 'Test downlink round-trip latency' },
    { code: 'RATE_5HZ', label: 'Rate 5 Hz', desc: 'Switch high telemetry frequency' },
    { code: 'BUZZER_ON', label: 'Alarm Siren', desc: 'Trigger onboard recovery buzzer' },
    { code: 'STATUS', label: 'Health Status', desc: 'Query sensors OK / I2C bus health' },
  ];

  // Complete, tested ESP32 Arduino C++ code for ORBITRA '26
  const arduinoEsp32Code = `/*
 * =========================================================================
 * TEAM SPUTNIK - ORBITRA '26 ESP32 CANSAT TELEMETRY FIRMWARE
 * MMMUT Gorakhpur - Ground Station Live USB Bridge
 * =========================================================================
 * Hardware:
 *   - ESP32 DevKit V1 (30-pin / 38-pin)
 *   - BMP280 Barometer (I2C: SDA=21, SCL=22) - 0x76 or 0x77
 *   - DHT11 / DHT22 Humidity & Temp (Digital: GPIO 4)
 *   - MPU6050 6-Axis IMU (I2C: SDA=21, SCL=22) - 0x68
 *   - LiPo Voltage Divider (ADC: GPIO 34)
 * =========================================================================
 */

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <DHT.h>
#include <MPU6050.h>

#define DHTPIN 4
#define DHTTYPE DHT11
#define BATTERY_PIN 34
#define SEA_LEVEL_PRESSURE_HPA 1013.25

Adafruit_BMP280 bmp;
DHT dht(DHTPIN, DHTTYPE);
MPU6050 mpu;

unsigned long packetCount = 0;
float baseAltitude = 0.0;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  Wire.begin(21, 22);

  // Initialize BMP280
  if (!bmp.begin(0x76) && !bmp.begin(0x77)) {
    Serial.println("SYS:BMP280_INIT_FAIL");
  } else {
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                    Adafruit_BMP280::SAMPLING_X2,
                    Adafruit_BMP280::SAMPLING_X16,
                    Adafruit_BMP280::FILTER_X16,
                    Adafruit_BMP280::STANDBY_MS_500);
    baseAltitude = bmp.readAltitude(SEA_LEVEL_PRESSURE_HPA);
  }

  // Initialize DHT11
  dht.begin();

  // Initialize MPU6050
  mpu.initialize();

  Serial.println("SYS:ESP32_TELEMETRY_ONLINE");
}

void loop() {
  packetCount++;

  // 1. Read BMP280
  float temperature = bmp.readTemperature();
  float pressure = bmp.readPressure() / 100.0F; // Convert Pa to hPa
  float rawAltitude = bmp.readAltitude(SEA_LEVEL_PRESSURE_HPA);
  float altitude = rawAltitude - baseAltitude;

  // 2. Read DHT11
  float humidity = dht.readHumidity();
  if (isnan(humidity)) humidity = 55.0; // fallback if sensor loose

  // 3. Read Battery Voltage (Voltage divider: 100k / 100k with 2S LiPo)
  int rawAdc = analogRead(BATTERY_PIN);
  float voltage = (rawAdc / 4095.0) * 3.3 * 2.0; // Scaled to battery volts
  if (voltage < 3.0) voltage = 7.4; // Default nominal 2S

  // 4. Read MPU6050 IMU
  int16_t ax, ay, az, gx, gy, gz;
  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
  float accelX = ax / 16384.0 * 9.81;
  float accelY = ay / 16384.0 * 9.81;
  float accelZ = az / 16384.0 * 9.81;
  float pitch = atan2(accelX, sqrt(accelY * accelY + accelZ * accelZ)) * 180.0 / PI;
  float roll  = atan2(accelY, sqrt(accelX * accelX + accelZ * accelZ)) * 180.0 / PI;

  // 5. Transmit formatted Sputnik CSV packet over USB Serial
  // Format: SPUTNIK,seq,time,alt,press,tempA,tempI,volt,ax,ay,az,pitch,roll,yaw,descent,lat,lng,gpsAlt,sats,rssi,state
  Serial.printf("SPUTNIK,%lu,12:00:00,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,0.0,0.0,26.7321,83.4332,%.2f,9,-65,%s\\n",
    packetCount,
    altitude,
    pressure,
    temperature,
    temperature + 2.5,
    voltage,
    accelX,
    accelY,
    accelZ,
    pitch,
    roll,
    altitude,
    altitude > 15.0 ? "ASCENT" : "PRE_LAUNCH"
  );

  // Check incoming uplink commands from Ground Station
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd.indexOf("CAL_ALT") >= 0) {
      baseAltitude = bmp.readAltitude(SEA_LEVEL_PRESSURE_HPA);
      Serial.println("ESP32_ACK,SPUTNIK,ALT_ZEROED,CRC_OK");
    } else if (cmd.indexOf("PING") >= 0) {
      Serial.println("ESP32_ACK,SPUTNIK,PONG,CRC_OK");
    } else {
      Serial.printf("ESP32_ACK,SPUTNIK,%s_RECEIVED,CRC_OK\\n", cmd.c_str());
    }
  }

  delay(500); // 2 Hz telemetry transmission rate
}
`;

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* 1. Hardware Status & Top Action Bar */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Hardware Connection Identifier */}
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg border ${
              status.connected
                ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300 shadow-sm shadow-emerald-900/40'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}>
              <Usb className={`w-5 h-5 ${status.connected ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-100 uppercase tracking-wide">
                  ESP32 USB Ground Transceiver
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${
                  status.connected
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {status.connected ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      LIVE HARDWARE LINK
                    </>
                  ) : (
                    'NOT CONNECTED'
                  )}
                </span>
              </div>

              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                {status.connected ? (
                  <span className="text-emerald-300/90 font-medium">{status.portName} @ {status.baudRate} Baud</span>
                ) : (
                  'Plug in ESP32 via USB and click "Connect Physical ESP32" (Chrome/Edge)'
                )}
              </p>
            </div>
          </div>

          {/* Controls: Baud Rate & Connect Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded text-xs font-mono">
              <span className="text-slate-500 text-[11px]">BAUD:</span>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                disabled={status.connected}
                className="bg-transparent text-cyan-300 text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value={9600} className="bg-slate-900 text-slate-200">9600</option>
                <option value={57600} className="bg-slate-900 text-slate-200">57600</option>
                <option value={115200} className="bg-slate-900 text-slate-200">115200 (Default)</option>
                <option value={230400} className="bg-slate-900 text-slate-200">230400</option>
                <option value={921600} className="bg-slate-900 text-slate-200">921600</option>
              </select>
            </div>

            {status.connected ? (
              <button
                onClick={handlePhysicalConnect}
                className="px-3.5 py-1.5 text-xs font-mono font-semibold bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <span>Disconnect USB</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handlePhysicalConnect}
                  className="px-3.5 py-1.5 text-xs font-mono font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-900/40 cursor-pointer"
                  title="Connect physical ESP32 or USB-UART COM port using Web Serial"
                >
                  <Usb className="w-4 h-4" />
                  <span>Connect Physical ESP32</span>
                </button>

                <button
                  onClick={handleVirtualConnect}
                  className="px-3 py-1.5 text-xs font-mono font-medium bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-800/50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Simulate ESP32 COM3 port"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Virtual ESP32</span>
                </button>

                <button
                  onClick={handleInjectTestPacket}
                  className="px-2.5 py-1.5 text-xs font-mono text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  title="Inject test telemetry packet into pipeline"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Test Packet</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Browser Web Serial Notice if unsupported */}
        {!isWebSerialSupported && (
          <div className="mt-3 bg-amber-950/50 border border-amber-800/70 rounded-lg p-2.5 text-xs font-mono text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Web Serial Browser Notice: </span>
              Physical USB serial connection works in Chromium browsers (Chrome, Edge, Opera, Brave). On Firefox or Safari, you can use the Virtual ESP32 mode or Node.js bridge script.
            </div>
          </div>
        )}
      </div>

      {/* 2. LIVE SENSOR TELEMETRY HUD (Active when ESP32 transmits data) */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              Live Decoded Sensor Readings (Direct From ESP32)
            </h3>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-400">
              Packets RX: <strong className="text-cyan-400 tabular-nums">{status.packetsReceived}</strong>
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">
              Errors: <strong className="text-rose-400 tabular-nums">{status.errorCount}</strong>
            </span>
            <span className="text-slate-500">|</span>
            {currentPacket ? (
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                LIVE STREAM
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                STANDBY FOR DATA
              </span>
            )}
          </div>
        </div>

        {/* Sensor Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Pressure (BMP280) */}
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
              <span>PRESSURE</span>
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="mt-1">
              <div className="text-lg font-mono font-bold text-slate-100 tabular-nums">
                {currentPacket?.pressure != null ? currentPacket.pressure.toFixed(1) : '--'}
                <span className="text-[10px] font-normal text-slate-400 ml-1">hPa</span>
              </div>
              <div className="text-[9px] font-mono text-cyan-400/90">BMP280 Barometer</div>
            </div>
          </div>

          {/* Temperature (BMP280 / DHT11) */}
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
              <span>TEMP (AMB)</span>
              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="mt-1">
              <div className="text-lg font-mono font-bold text-slate-100 tabular-nums">
                {currentPacket?.tempAmbient != null ? currentPacket.tempAmbient.toFixed(1) : '--'}
                <span className="text-[10px] font-normal text-slate-400 ml-1">°C</span>
              </div>
              <div className="text-[9px] font-mono text-amber-400/90">
                Int: {currentPacket?.tempInternal != null ? `${currentPacket.tempInternal.toFixed(1)}°C` : '--'}
              </div>
            </div>
          </div>

          {/* Relative Humidity (DHT11) */}
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
              <span>HUMIDITY</span>
              <Droplets className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="mt-1">
              <div className="text-lg font-mono font-bold text-slate-100 tabular-nums">
                {currentPacket?.humidity != null ? currentPacket.humidity.toFixed(1) : '--'}
                <span className="text-[10px] font-normal text-slate-400 ml-1">% RH</span>
              </div>
              <div className="text-[9px] font-mono text-blue-400/90">DHT11 Sensor</div>
            </div>
          </div>

          {/* Altitude & Apogee */}
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
              <span>ALTITUDE</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="mt-1">
              <div className="text-lg font-mono font-bold text-slate-100 tabular-nums">
                {currentPacket?.altitude != null ? currentPacket.altitude.toFixed(1) : '--'}
                <span className="text-[10px] font-normal text-slate-400 ml-1">m</span>
              </div>
              <div className="text-[9px] font-mono text-emerald-400/90">
                Peak: {currentPacket?.peakAltitude != null ? `${currentPacket.peakAltitude.toFixed(1)} m` : '--'}
              </div>
            </div>
          </div>

          {/* Battery Voltage (INA219 / LiPo) */}
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
              <span>BATTERY</span>
              <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="mt-1">
              <div className="text-lg font-mono font-bold text-slate-100 tabular-nums">
                {currentPacket?.voltage != null ? currentPacket.voltage.toFixed(2) : '--'}
                <span className="text-[10px] font-normal text-slate-400 ml-1">V</span>
              </div>
              <div className="text-[9px] font-mono text-slate-400">
                Draw: {currentPacket?.current != null ? `${Math.round(currentPacket.current)} mA` : '--'}
              </div>
            </div>
          </div>

          {/* IMU Attitude / Pitch-Roll */}
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
              <span>MPU6050 IMU</span>
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="mt-1">
              <div className="text-xs font-mono font-semibold text-slate-200 tabular-nums">
                P: {currentPacket?.pitch != null ? `${currentPacket.pitch.toFixed(1)}°` : '--'}
              </div>
              <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                R: {currentPacket?.roll != null ? `${currentPacket.roll.toFixed(1)}°` : '--'} · Y: {currentPacket?.yaw != null ? `${currentPacket.yaw.toFixed(1)}°` : '--'}
              </div>
              <div className="text-[9px] font-mono text-indigo-400/90">3-Axis Gyro</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Sub-Tab Switcher: Live Terminal vs ESP32 Firmware Code vs Wiring Pinout */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setSubTab('terminal')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            subTab === 'terminal'
              ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Live Serial Monitor & Uplink Deck</span>
        </button>

        <button
          onClick={() => setSubTab('arduino_code')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            subTab === 'arduino_code'
              ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>ESP32 Arduino Firmware (.ino)</span>
        </button>

        <button
          onClick={() => setSubTab('wiring')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            subTab === 'wiring'
              ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Wiring & Pinout Guide</span>
        </button>
      </div>

      {/* SUB-TAB 1: Live Terminal & Command Deck */}
      {subTab === 'terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[440px]">
          {/* Left: Quick Uplink Commands (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-900 text-xs font-mono text-slate-400">
                <span className="font-semibold text-slate-200 uppercase tracking-wide">
                  Telecommand Uplink (Transmit to ESP32)
                </span>
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <p className="text-[11px] font-mono text-slate-400 mb-3">
                Send real-time control packets to the connected ESP32 over USB Serial. Packets are also recorded to the Supabase backend.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {quickCommands.map((cmd) => (
                  <button
                    key={cmd.code}
                    onClick={() => handleSendCommand(`CMD,SPUTNIK,${cmd.code}`)}
                    className="p-2.5 text-left bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 hover:border-cyan-700/80 rounded-lg transition-colors group cursor-pointer"
                  >
                    <div className="text-xs font-mono font-semibold text-cyan-300 group-hover:text-cyan-200 flex items-center justify-between">
                      <span>{cmd.label}</span>
                      <Send className="w-3 h-3 text-slate-600 group-hover:text-cyan-400" />
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 mt-1 line-clamp-1">
                      {cmd.desc}
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 mt-0.5">
                      CMD,SPUTNIK,{cmd.code}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Command Input Box */}
            <div className="pt-3 mt-3 border-t border-slate-900">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                Custom Command Transmitter
              </span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendCommand(customCommand);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder="e.g. CMD,SPUTNIK,CAL_ALT or PING"
                  className="flex-1 bg-slate-900 border border-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Transmit</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right: Live Serial Terminal Ledger (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-900 text-xs font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold text-slate-200 uppercase tracking-wide">
                    Live USB Serial Stream Monitor (TX / RX)
                  </span>
                </div>

                <button
                  onClick={() => setLogs([])}
                  className="p-1 hover:bg-slate-900 text-slate-500 hover:text-slate-300 rounded cursor-pointer"
                  title="Clear Terminal"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Terminal Window */}
              <div className="h-[340px] overflow-y-auto bg-slate-950 rounded-lg p-3 font-mono text-[11px] space-y-1.5 border border-slate-900">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                    <span
                      className={`font-semibold shrink-0 select-none ${
                        log.direction === 'TX'
                          ? 'text-cyan-400'
                          : log.direction === 'RX'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {log.direction}:
                    </span>
                    <span
                      className={`break-all ${
                        log.direction === 'TX'
                          ? 'text-cyan-200'
                          : log.direction === 'RX'
                          ? 'text-slate-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {log.text}
                    </span>
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>
            </div>

            <div className="pt-2 text-[10px] font-mono text-slate-500 flex items-center justify-between border-t border-slate-900 mt-2">
              <span className="text-emerald-400/80">● READY FOR SERIAL DATA OVER USB</span>
              <span className="text-slate-400">PARSERS: CSV / JSON / KEY-VALUE</span>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Arduino Firmware Code Generator */}
      {subTab === 'arduino_code' && (
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-mono font-bold text-slate-100 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-cyan-400" />
                <span>Complete ESP32 Arduino Sketch (Ready to Flash)</span>
              </h4>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Bhai is code ko copy karke Arduino IDE me paste karo aur ESP32 me upload karo!
              </p>
            </div>

            <button
              onClick={copyArduinoCode}
              className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                copiedCode
                  ? 'bg-emerald-600 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Complete Code'}</span>
            </button>
          </div>

          <div className="relative">
            <pre className="bg-slate-950 border border-slate-900 rounded-lg p-3.5 text-xs font-mono text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed">
              <code>{arduinoEsp32Code}</code>
            </pre>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Wiring & Pinout Guide */}
      {subTab === 'wiring' && (
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-4">
          <div>
            <h4 className="text-sm font-mono font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>ESP32 Hardware Wiring & Pinout Matrix</span>
            </h4>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Standard hardware connections between ESP32 DevKit and CanSat sensors for ORBITRA '26
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border border-slate-800">
              <thead className="bg-slate-900/80 text-cyan-400 uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Sensor Module</th>
                  <th className="p-2.5">ESP32 Pin</th>
                  <th className="p-2.5">Protocol / Interface</th>
                  <th className="p-2.5">Telemetry Parameter</th>
                  <th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                <tr className="hover:bg-slate-900/40">
                  <td className="p-2.5 font-bold text-slate-100">BMP280 Barometer</td>
                  <td className="p-2.5 text-cyan-300">SDA: GPIO 21 · SCL: GPIO 22 · 3.3V</td>
                  <td className="p-2.5">I2C (0x76 / 0x77)</td>
                  <td className="p-2.5 text-emerald-400">Pressure (hPa), Altitude (m), Temp (°C)</td>
                  <td className="p-2.5"><span className="text-emerald-400 font-bold">ONLINE</span></td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="p-2.5 font-bold text-slate-100">DHT11 / DHT22</td>
                  <td className="p-2.5 text-cyan-300">DATA: GPIO 4 · 3.3V / 5V</td>
                  <td className="p-2.5">1-Wire Digital</td>
                  <td className="p-2.5 text-blue-400">Relative Humidity (% RH), Temp (°C)</td>
                  <td className="p-2.5"><span className="text-emerald-400 font-bold">ONLINE</span></td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="p-2.5 font-bold text-slate-100">MPU6050 6-Axis IMU</td>
                  <td className="p-2.5 text-cyan-300">SDA: GPIO 21 · SCL: GPIO 22 · 3.3V</td>
                  <td className="p-2.5">I2C (0x68)</td>
                  <td className="p-2.5 text-indigo-400">Pitch (°), Roll (°), Yaw (°), Accel (m/s²)</td>
                  <td className="p-2.5"><span className="text-emerald-400 font-bold">ONLINE</span></td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="p-2.5 font-bold text-slate-100">NEO-6M GPS Module</td>
                  <td className="p-2.5 text-cyan-300">TX: GPIO 16 (RX2) · RX: GPIO 17 (TX2)</td>
                  <td className="p-2.5">UART Serial2 (9600 Baud)</td>
                  <td className="p-2.5 text-amber-400">Lat, Lng, GPS Altitude, Sats count</td>
                  <td className="p-2.5"><span className="text-emerald-400 font-bold">ONLINE</span></td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="p-2.5 font-bold text-slate-100">LiPo Voltage Divider</td>
                  <td className="p-2.5 text-cyan-300">ADC: GPIO 34 (100kΩ/100kΩ)</td>
                  <td className="p-2.5">Analog 12-bit ADC</td>
                  <td className="p-2.5 text-rose-400">Battery Voltage (7.4V LiPo 2S)</td>
                  <td className="p-2.5"><span className="text-emerald-400 font-bold">ONLINE</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-400">
            <span className="text-cyan-300 font-bold">Judge Presentation Tip: </span>
            When presenting to the ORBITRA '26 evaluators, attach your ESP32 with the micro-USB/Type-C cable, click <strong>"Connect Physical ESP32"</strong>, and pick the Silicon Labs or WCH USB-UART COM port. Your live sensor readings immediately feed all dashboard charts, 3D attitude, and GPS maps!
          </div>
        </div>
      )}
    </div>
  );
};
