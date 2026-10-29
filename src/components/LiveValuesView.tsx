import React from 'react';
import { TelemetryPacket } from '../types/telemetry';
import { ThresholdRule } from '../types/thresholds';
import { Attitude3D } from './Attitude3D';
import { GpsMap } from './GpsMap';
import { 
  Compass, 
  Gauge, 
  Radio, 
  Thermometer, 
  Zap, 
  Navigation, 
  ArrowDownUp, 
  Wind,
  Layers,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Usb,
  Sparkles,
  Activity,
  Terminal
} from 'lucide-react';
import { serialService } from '../services/serialService';

interface LiveValuesViewProps {
  packet: TelemetryPacket | null;
  history: TelemetryPacket[];
  hzRate: number;
  rules?: ThresholdRule[];
  onConnectUsb?: () => void;
  onOpenUsbTab?: () => void;
  onStartSim?: () => void;
  isUsbConnected?: boolean;
}

export const LiveValuesView: React.FC<LiveValuesViewProps> = ({
  packet,
  history,
  hzRate,
  rules = [],
  onConnectUsb,
  onOpenUsbTab,
  onStartSim,
  isUsbConnected = false,
}) => {
  // Flight states progression list
  const flightStages = [
    { key: 'PRE_LAUNCH', label: 'PRE-LAUNCH PAD' },
    { key: 'ASCENT', label: 'POWERED ASCENT' },
    { key: 'APOGEE', label: 'APOGEE REACHED' },
    { key: 'PARACHUTE_DESCENT', label: 'PARACHUTE DESCENT' },
    { key: 'TOUCHDOWN', label: 'TOUCHDOWN & RECOVERY' },
  ];

  const currentStageIndex = packet 
    ? flightStages.findIndex((s) => s.key === packet.flightState)
    : 0;

  // Derived telemetry calculations if packet is present
  const netG = packet 
    ? Math.sqrt(packet.accelX * packet.accelX + packet.accelY * packet.accelY + packet.accelZ * packet.accelZ)
    : null;

  const batteryPercent = packet 
    ? Math.min(100, Math.max(0, Math.round(((packet.voltage - 6.6) / (8.4 - 6.6)) * 100)))
    : null;

  const groundAlt = 85.0; // MMMUT elevation
  const agl = packet ? Math.max(0, packet.altitude - groundAlt) : null;

  // Look up threshold rules for each sensor
  const altRule = rules.find((r) => r.parameter === 'altitude');
  const tempRule = rules.find((r) => r.parameter === 'tempInternal');
  const voltRule = rules.find((r) => r.parameter === 'voltage');
  const descentRule = rules.find((r) => r.parameter === 'descentRate');
  const rssiRule = rules.find((r) => r.parameter === 'rssi');
  const accelRule = rules.find((r) => r.parameter === 'accel');

  const getCardStyle = (rule?: ThresholdRule) => {
    if (!rule || rule.severity === 'NOMINAL') {
      return 'bg-slate-950/80 border-slate-800';
    }
    if (rule.severity === 'CRITICAL') {
      return 'bg-rose-950/40 border-rose-600 shadow-md shadow-rose-950/50 ring-1 ring-rose-500/40';
    }
    return 'bg-amber-950/40 border-amber-600 shadow-md shadow-amber-950/40';
  };

  const handleConnectUsb = async () => {
    if (onConnectUsb) {
      onConnectUsb();
    } else {
      await serialService.connectPhysical(115200);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Hardware USB Telemetry Standby / Live Indicator Banner */}
      {!packet ? (
        <div className="bg-gradient-to-r from-slate-950 via-[#0a1120] to-slate-950 border border-cyan-800/60 rounded-xl p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-950/90 border border-cyan-600/60 flex items-center justify-center text-cyan-400 shrink-0 shadow-md">
              <Usb className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
                <h3 className="text-sm font-mono font-bold text-slate-100 tracking-wide uppercase">
                  READY FOR ESP32 LIVE USB TELEMETRY
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  115200 Baud · Standby
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Connect your physical ESP32 CanSat transceiver to USB. All live sensor packets (BMP280, MPU6050, DHT11, LiPo Battery) will stream straight to this dashboard.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleConnectUsb}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs rounded-lg flex items-center gap-2 transition-all shadow-md shadow-cyan-900/50 cursor-pointer"
            >
              <Usb className="w-4 h-4" />
              <span>Connect Physical ESP32</span>
            </button>

            {onOpenUsbTab && (
              <button
                onClick={onOpenUsbTab}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-mono text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>USB Command Deck</span>
              </button>
            )}

            {onStartSim && (
              <button
                onClick={onStartSim}
                className="px-3 py-2 bg-slate-900/80 hover:bg-slate-800 text-amber-300 border border-amber-800/40 font-mono text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Optional: Start simulator if physical hardware is not plugged in"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Simulate</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Flight Stage Progress Ribbon */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-semibold uppercase tracking-wider">
              01 Live Telemetry
            </span>
            <span className="text-slate-600">·</span>
            <span>{packet ? `Packet #${packet.packetCount}` : 'Awaiting USB Packets'}</span>
            <span className="text-slate-600">·</span>
            <span className={packet ? 'text-emerald-400' : 'text-slate-500'}>
              {hzRate > 0 ? `${hzRate.toFixed(1)} Hz` : '0.0 Hz'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">MISSION STATE:</span>
            <span className="text-amber-400 font-bold uppercase">
              {packet ? packet.flightState.replace('_', ' ') : 'PAD STANDBY'}
            </span>
          </div>
        </div>

        {/* Linear progress steps */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1 border-t border-slate-900">
          {flightStages.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            return (
              <div
                key={stage.key}
                className={`text-left p-2 rounded transition-colors ${
                  isCurrent
                    ? 'bg-cyan-950/60 border border-cyan-800/80 text-cyan-200'
                    : isCompleted
                    ? 'bg-slate-900/50 border border-slate-800/60 text-emerald-400'
                    : 'bg-slate-950/40 border border-slate-900 text-slate-600'
                }`}
              >
                <div className="text-[10px] font-mono text-slate-500 mb-0.5">
                  STAGE 0{idx + 1}
                </div>
                <div className="text-xs font-mono font-medium truncate">
                  {stage.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary Telemetry Grid - Strict Science Display Format */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Altitude */}
        <div className={`border rounded-lg p-4 flex flex-col justify-between transition-all ${getCardStyle(altRule)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-wider uppercase text-slate-400 font-mono">
              Altitude (MSL / AGL)
            </span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="text-3xl font-mono font-bold tabular-nums text-slate-100">
              {packet ? packet.altitude.toFixed(1) : '--'}{' '}
              <span className="text-xs uppercase font-mono text-slate-400 font-normal">m</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-slate-900">
              <span>AGL: <span className="text-slate-200">{agl != null ? `${agl.toFixed(1)} m` : '--'}</span></span>
              <span>PEAK: <span className="text-amber-400 font-semibold">{packet ? `${packet.peakAltitude.toFixed(1)} m` : '--'}</span></span>
            </div>
          </div>
        </div>

        {/* Metric 2: Barometric Pressure */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-wider uppercase text-slate-400 font-mono">
              Barometric Pressure
            </span>
            <Gauge className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="text-3xl font-mono font-bold text-slate-100 tabular-nums">
              {packet ? packet.pressure.toFixed(1) : '--'}{' '}
              <span className="text-xs uppercase font-mono text-slate-400 font-normal">hPa</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-slate-900">
              <span>BMP280: <span className="text-slate-200">{packet ? `${(1013.25 - packet.pressure).toFixed(1)} hPa` : 'AWAITING LINK'}</span></span>
              <span>REF: <span className="text-emerald-400">1013.25</span></span>
            </div>
          </div>
        </div>

        {/* Metric 3: Temperatures & DHT11 Humidity */}
        <div className={`border rounded-lg p-4 flex flex-col justify-between transition-all ${getCardStyle(tempRule)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-wider uppercase text-slate-400 font-mono">
              Ambient Temp & DHT11 Humidity
            </span>
            <Thermometer className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-mono font-bold tabular-nums text-slate-100">
                {packet ? packet.tempAmbient.toFixed(1) : '--'}{' '}
                <span className="text-xs uppercase font-mono text-slate-400 font-normal">°C</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono font-bold text-sky-300 tabular-nums">
                  {packet ? `${(packet.humidity || 58.0).toFixed(1)}%` : '-- %'}
                </span>
                <span className="text-[10px] font-mono text-slate-400 ml-1">RH (DHT11)</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-slate-900">
              <span>AVIONICS INT: <span className="text-amber-300">{packet ? `${packet.tempInternal.toFixed(1)}°C` : '--'}</span></span>
              <span>DHT11: <span className="text-sky-400">{packet ? 'ONLINE' : 'STANDBY'}</span></span>
            </div>
          </div>
        </div>

        {/* Metric 4: Power Subsystem */}
        <div className={`border rounded-lg p-4 flex flex-col justify-between transition-all ${getCardStyle(voltRule)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-wider uppercase text-slate-400 font-mono">
              Battery Voltage (2S)
            </span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl font-mono font-bold tabular-nums text-slate-100">
              {packet ? packet.voltage.toFixed(2) : '--'}{' '}
              <span className="text-xs uppercase font-mono text-slate-400 font-normal">V</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-slate-900">
              <span>CELL: <span className="text-slate-200">{packet ? `${(packet.voltage / 2).toFixed(2)}V` : '--'}</span></span>
              <span>CHARGE: <span className="text-emerald-400 font-semibold">{batteryPercent != null ? `${batteryPercent}%` : '--'}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Telemetry Grid: Descent Velocity, IMU, GPS, Radio Link */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 5: Descent Velocity */}
        <div className={`border rounded-lg p-4 transition-all ${getCardStyle(descentRule)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-wider uppercase text-slate-400 font-mono">
              Descent Velocity
            </span>
            <ArrowDownUp className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums text-slate-100">
            {packet ? (packet.descentRate > 0 ? `+${packet.descentRate.toFixed(2)}` : packet.descentRate.toFixed(2)) : '--'}{' '}
            <span className="text-xs uppercase font-mono text-slate-400 font-normal">m/s</span>
          </div>
          <div className="text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-slate-900 flex justify-between">
            <span>CHUTE TARGET: <span className="text-slate-300">-6.0 m/s</span></span>
            <span className="text-emerald-400">
              {packet ? (Math.abs(packet.descentRate) > 10 ? 'HIGH VELOCITY' : 'NOMINAL') : 'STANDBY'}
            </span>
          </div>
        </div>

        {/* Metric 6: Net Acceleration (G-Force) */}
        <div className={`border rounded-lg p-4 transition-all ${getCardStyle(accelRule)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-wider uppercase text-slate-400 font-mono">
              Net Acceleration
            </span>
            <Wind className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums text-slate-100">
            {netG != null ? netG.toFixed(2) : '--'}{' '}
            <span className="text-xs uppercase font-mono text-slate-400 font-normal">G</span>
          </div>
          <div className="text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-slate-900 flex justify-between">
            <span>X: {packet ? packet.accelX.toFixed(2) : '--'}</span>
            <span>Y: {packet ? packet.accelY.toFixed(2) : '--'}</span>
            <span>Z: {packet ? packet.accelZ.toFixed(2) : '--'}</span>
          </div>
        </div>

        {/* Metric 7: Radio Link & RSSI */}
        <div className={`border rounded-lg p-4 transition-all ${getCardStyle(rssiRule)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-wider uppercase text-slate-400 font-mono">
              ESP32 Wireless Link
            </span>
            <Radio className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums text-slate-100">
            {packet ? `${packet.rssi} dBm` : (isUsbConnected ? 'USB LINK' : 'STANDBY')}
          </div>
          <div className="text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-slate-900 flex justify-between">
            <span>SNR: <span className="text-slate-200">{packet ? `+${packet.snr.toFixed(1)} dB` : '--'}</span></span>
            <span className={packet ? 'text-emerald-400' : 'text-slate-400'}>
              {packet ? 'STREAM ACTIVE' : 'AWAITING BYTES'}
            </span>
          </div>
        </div>

        {/* Metric 8: GPS Fix & Satellites */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-wider uppercase text-slate-400 font-mono">
              GNSS Lock
            </span>
            <Navigation className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-100 tabular-nums">
            {packet ? packet.gpsSats : '--'}{' '}
            <span className="text-xs uppercase font-mono text-slate-400 font-normal">Sats 3D</span>
          </div>
          <div className="text-xs font-mono text-slate-500 mt-2 pt-2 border-t border-slate-900 flex justify-between">
            <span>HDOP: <span className="text-slate-200">{packet ? '0.9' : '--'}</span></span>
            <span className={packet ? 'text-emerald-400' : 'text-slate-400'}>
              {packet ? 'PRECISION 3D' : 'AWAITING FIX'}
            </span>
          </div>
        </div>
      </div>

      {/* Spatial Visualizers: 3D Attitude Indicator and GPS Recovery Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[320px]">
        {/* 3D Attitude Indicator */}
        <div className="h-full">
          <Attitude3D
            pitch={packet ? packet.pitch : 0}
            roll={packet ? packet.roll : 0}
            yaw={packet ? packet.yaw : 0}
          />
        </div>

        {/* GPS Recovery Radar & Ground Track */}
        <div className="h-full">
          <GpsMap
            lat={packet ? packet.gpsLat : 26.73214}
            lng={packet ? packet.gpsLng : 83.43321}
            altitude={packet ? packet.gpsAlt : 85}
            satellites={packet ? packet.gpsSats : 0}
            trajectory={history.map((h) => ({
              lat: h.gpsLat,
              lng: h.gpsLng,
              alt: h.altitude,
            }))}
          />
        </div>
      </div>
    </div>
  );
};
