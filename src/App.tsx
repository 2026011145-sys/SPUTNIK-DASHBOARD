import React, { useState, useEffect, useRef } from 'react';
import { serialService } from './services/serialService';
import { simulationService } from './services/simulationService';
import { TelemetryPacket, SerialPortStatus } from './types/telemetry';
import { LiveValuesView } from './components/LiveValuesView';
import { TimeSeriesView } from './components/TimeSeriesView';
import { OpenMctView } from './components/OpenMctView';
import { HardwarePipelineView } from './components/HardwarePipelineView';
import { UsbCommandDeck } from './components/UsbCommandDeck';
import { TeamSputnikModal } from './components/TeamSputnikModal';
import { SensorShowcaseView } from './components/SensorShowcaseView';
import { UsbConnectModal } from './components/UsbConnectModal';
import { ThresholdConfigModal } from './components/ThresholdConfigModal';
import { MissionChecklistSidebar } from './components/MissionChecklistSidebar';
import { PreFlightDiagnosticsModal } from './components/PreFlightDiagnosticsModal';
import { thresholdService } from './services/thresholdService';
import { ThresholdRule, AlertSeverity, AlarmIncident } from './types/thresholds';
import { 
  Radio, 
  Usb, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  RotateCcw, 
  ShieldCheck, 
  GraduationCap,
  Activity,
  Layers,
  Sparkles,
  Cpu,
  AlertTriangle,
  AlertOctagon,
  Sliders,
  CheckSquare,
  Database,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { supabaseService, SupabaseSyncState } from './services/supabaseService';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
import { AdminPortalView } from './components/AdminPortalView';
import { CubeSatShowcaseView } from './components/CubeSatShowcaseView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'plots' | 'openmct' | 'pipeline' | 'usb' | 'sensors' | 'admin' | 'cubesat'>('live');
  const [currentPacket, setCurrentPacket] = useState<TelemetryPacket | null>(null);
  const [history, setHistory] = useState<TelemetryPacket[]>([]);
  const [isPresentationMode, setIsPresentationMode] = useState<boolean>(false);


  const [serialStatus, setSerialStatus] = useState<SerialPortStatus>(serialService.getStatus());
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [audioBeep, setAudioBeep] = useState<boolean>(false);
  const [showTeamModal, setShowTeamModal] = useState<boolean>(false);
  const [showUsbModal, setShowUsbModal] = useState<boolean>(false);
  const [showThresholdModal, setShowThresholdModal] = useState<boolean>(false);
  const [showChecklistSidebar, setShowChecklistSidebar] = useState<boolean>(false);
  const [showPreflightDiagnostics, setShowPreflightDiagnostics] = useState<boolean>(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState<boolean>(false);
  const [supabaseState, setSupabaseState] = useState<SupabaseSyncState>(supabaseService.getState());
  const [hasCompletedPreflight, setHasCompletedPreflight] = useState<boolean>(true);
  const [thresholdRules, setThresholdRules] = useState<ThresholdRule[]>([]);
  const [maxSeverity, setMaxSeverity] = useState<AlertSeverity>('NOMINAL');
  const [alarmIncidents, setAlarmIncidents] = useState<AlarmIncident[]>([]);


  // Mission Elapsed Time (MET)
  const [missionElapsedSec, setMissionElapsedSec] = useState<number>(0);
  const [isClockRunning, setIsClockRunning] = useState<boolean>(true);

  // Packet frequency calculation
  const [packetCountLastSec, setPacketCountLastSec] = useState<number>(0);
  const [hzRate, setHzRate] = useState<number>(0);
  const packetCountRef = useRef<number>(0);

  // Audio Context for telemetry beeps
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playTelemetryBeep = (isAlarm: boolean = false) => {
    if (!audioBeep) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isAlarm ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(isAlarm ? 880 : 1450, ctx.currentTime);
      gain.gain.setValueAtTime(isAlarm ? 0.08 : 0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (isAlarm ? 0.12 : 0.05));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (isAlarm ? 0.12 : 0.05));
    } catch (e) {
      // Audio autoplay restrictions
    }
  };

  // Subscribe to serial packets & Supabase state
  useEffect(() => {
    // Awaiting real physical USB ESP32 serial data by default
    const unsubSupabase = supabaseService.subscribe((state) => {
      setSupabaseState(state);
    });

    const unsubPacket = serialService.onPacket((packet) => {
      packetCountRef.current++;
      setCurrentPacket(packet);

      // Stream to Supabase backend in real-time
      supabaseService.streamTelemetryPacket(packet);

      // Evaluate threshold monitoring
      const evalRes = thresholdService.evaluate(packet);
      setThresholdRules(evalRes.rules);
      setMaxSeverity(evalRes.maxSeverity);
      setAlarmIncidents(thresholdService.getIncidents());

      playTelemetryBeep(evalRes.maxSeverity === 'CRITICAL');

      setHistory((prev) => {
        // Keep up to 600 packets in memory for smooth charting
        const next = [...prev, packet];
        if (next.length > 600) next.shift();
        return next;
      });
    });

    const unsubStatus = serialService.onStatus((status) => {
      setSerialStatus(status);
      if (status.connected) {
        // If real USB connects, stop simulator to receive real hardware data
        simulationService.stop();
        setIsSimulating(false);
      }
    });

    return () => {
      unsubPacket();
      unsubStatus();
      unsubSupabase();
      simulationService.stop();
    };
  }, [audioBeep]);


  // Frequency calculator
  useEffect(() => {
    const timer = setInterval(() => {
      setHzRate(packetCountRef.current);
      packetCountRef.current = 0;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Mission Elapsed Time timer
  useEffect(() => {
    if (!isClockRunning) return;
    const interval = setInterval(() => {
      setMissionElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isClockRunning]);

  const formatMet = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `T+${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleSimulation = () => {
    if (isSimulating) {
      simulationService.stop();
      setIsSimulating(false);
    } else {
      simulationService.start();
      setIsSimulating(true);
    }
  };

  const handleUsbConnectToggle = async () => {
    if (serialStatus.connected) {
      await serialService.disconnect();
    } else {
      const ok = await serialService.connectPhysical(115200);
      if (ok.success) {
        setActiveTab('usb');
      }
    }
  };

  return (
    <div className={`min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 w-full max-w-full overflow-x-hidden ${isPresentationMode ? 'bg-[#04060a]' : ''}`}>
      {/* 1. Top Bar: Resilient, Zero-Horizontal-Scroll Design */}
      <header className="w-full max-w-full border-b border-slate-800 bg-[#07090e]/95 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 py-2.5">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 max-w-7xl mx-auto w-full">
          {/* Zone 1: Wordmark & Live Indicator */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('live');
              }}
              className="text-sm sm:text-base font-bold font-mono tracking-tight text-slate-100 whitespace-nowrap flex items-center gap-2 hover:text-cyan-400 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-xs bg-cyan-400 inline-block shadow-sm shadow-cyan-400/50 animate-pulse" />
              <span>ORBITRA ’26</span>
              <span className="text-cyan-400 font-semibold">· SPUTNIK</span>
            </a>
            <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              MMMUT
            </span>
          </div>

          {/* Zone 2: Primary Flight Navigation (Compact, fits all presentation viewports) */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-xs font-mono font-medium">
            {[
              { id: 'live', label: '01 Live' },
              { id: 'plots', label: '02 Plots' },
              { id: 'openmct', label: '03 Open MCT' },
              { id: 'pipeline', label: 'Pipeline' },
              { id: 'usb', label: 'USB' },
              { id: 'sensors', label: 'Sensors' },
              { id: 'cubesat', label: 'CubeSat N1U', isCubeSat: true },
              { id: 'admin', label: 'Admin', isSpecial: true },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-2.5 py-1.5 rounded transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? tab.isSpecial
                      ? 'bg-amber-950 text-amber-300 font-bold border border-amber-600 shadow-xs'
                      : (tab as any).isCubeSat
                      ? 'bg-blue-950 text-blue-300 font-bold border border-blue-500 shadow-xs'
                      : 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700 shadow-xs'
                    : tab.isSpecial
                    ? 'text-amber-400/90 hover:text-amber-300 hover:bg-slate-900/60'
                    : (tab as any).isCubeSat
                    ? 'text-blue-400 hover:text-blue-200 hover:bg-blue-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Quick Tools & Presenter Actions */}
          <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
            {/* Supabase Persistence Modal Trigger */}
            <button
              onClick={() => setShowSupabaseModal(true)}
              className="px-2.5 py-1.5 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 hover:bg-emerald-900 shadow-xs cursor-pointer"
              title="Open Supabase Cloud Center & Form Entry"
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Supabase</span>
              <span className="px-1.5 py-0.2 bg-emerald-900 text-white rounded text-[10px]">
                {supabaseState.totalSyncedCount}
              </span>
            </button>

            {/* Checklist trigger */}
            <button
              onClick={() => setShowChecklistSidebar(true)}
              className="px-2.5 py-1.5 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 bg-cyan-950/80 border border-cyan-800 text-cyan-300 hover:bg-cyan-900 shadow-xs cursor-pointer"
              title="Open Pre-Flight Mission Checklist"
            >
              <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden xl:inline">Checklist</span>
            </button>

            {/* USB Connect Trigger */}
            <button
              onClick={() => setShowUsbModal(true)}
              className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                serialStatus.connected
                  ? 'bg-emerald-950 border border-emerald-600 text-emerald-300 hover:bg-emerald-900'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs'
              }`}
              title="Connect USB Transceiver"
            >
              <Usb className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {serialStatus.connected ? 'USB Active' : 'USB'}
              </span>
            </button>

            {/* Presentation Mode Toggle */}
            <button
              onClick={() => setIsPresentationMode((p) => !p)}
              className={`p-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                isPresentationMode
                  ? 'bg-amber-950 border-amber-600 text-amber-300 shadow-xs'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isPresentationMode ? 'Exit Presentation Mode' : 'Enter Judge Presentation Mode (Locked Viewport)'}
            >
              {isPresentationMode ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Mobile & Tablet Tab Bar (Flex-Wrap, NO Horizontal Scrolling) */}
        <div className="lg:hidden flex flex-wrap items-center justify-start gap-1.5 mt-2.5 pt-2 border-t border-slate-800/80 text-xs font-mono">
          {[
            { id: 'live', label: '01 Live' },
            { id: 'plots', label: '02 Plots' },
            { id: 'openmct', label: '03 Open MCT' },
            { id: 'pipeline', label: 'Pipeline' },
            { id: 'usb', label: 'USB' },
            { id: 'sensors', label: 'Sensors' },
            { id: 'cubesat', label: 'CubeSat N1U', isCubeSat: true },
            { id: 'admin', label: 'Admin', isSpecial: true },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap text-[11px] ${
                activeTab === tab.id
                  ? tab.isSpecial
                    ? 'bg-amber-950 text-amber-300 font-bold border border-amber-700'
                    : (tab as any).isCubeSat
                    ? 'bg-blue-950 text-blue-300 font-bold border border-blue-500'
                    : 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800'
                  : (tab as any).isCubeSat
                  ? 'text-blue-400 bg-blue-950/40 border border-blue-900/50'
                  : 'text-slate-400 bg-slate-900/60 border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => setShowTeamModal(true)}
            className="px-2 py-1 rounded text-[11px] text-amber-400 bg-amber-950/40 border border-amber-900/60"
          >
            Team
          </button>
        </div>
      </header>


      {/* Main Mission Control Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 md:p-6 space-y-4 min-w-0 overflow-x-hidden">
        {/* Judge Presentation Mode Notification HUD */}
        {isPresentationMode && (
          <div className="bg-gradient-to-r from-amber-950/90 via-[#181106] to-amber-950/90 border border-amber-500/80 text-amber-200 px-4 py-2.5 rounded-lg flex items-center justify-between text-xs font-mono shadow-lg shadow-amber-950/50 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="font-bold text-amber-300 tracking-wide">ORBITRA ’26 JUDGE EVALUATION HUD ACTIVE</span>
              <span className="text-slate-400 hidden md:inline">· Team Sputnik · MMMUT Gorakhpur · Real-time Live Sensor Bus</span>
            </div>
            <button
              onClick={() => setIsPresentationMode(false)}
              className="px-2.5 py-1 bg-amber-900/80 hover:bg-amber-800 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Exit Presentation HUD
            </button>
          </div>
        )}

        {/* Mission Status Header Strip - Zero Pill Discipline */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="text-cyan-400 font-semibold">ORBITRA ’26 TELEMETRY GROUND STATION</span>
              <span className="text-slate-600">·</span>
              <span>MMMUT GORAKHPUR</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-xl font-mono font-bold text-slate-100 tracking-tight">
                TEAM SPUTNIK
              </h1>
              <span className="text-xs font-mono text-slate-400">
                Leader: <span className="text-slate-200 font-medium">Ujjwal Yadav</span>
              </span>
              <span className="text-slate-600 hidden sm:inline">·</span>
              <button
                onClick={() => setShowTeamModal(true)}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline underline-offset-2 hidden sm:inline"
              >
                View 4 Members
              </button>
            </div>
          </div>

          {/* Telemetry Clock & Status Controls */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 font-mono text-xs">
            {/* Mission Elapsed Time */}
            <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded flex items-center gap-2">
              <span className="text-slate-500">MET:</span>
              <span className="text-cyan-300 font-bold text-sm tracking-wide">
                {formatMet(missionElapsedSec)}
              </span>
              <button
                onClick={() => setIsClockRunning((r) => !r)}
                className="p-1 hover:text-slate-200 text-slate-500"
                title={isClockRunning ? 'Hold Clock' : 'Start Clock'}
              >
                {isClockRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setMissionElapsedSec(0)}
                className="p-1 hover:text-slate-200 text-slate-500"
                title="Reset MET"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Pre-Flight Sensor Diagnostics / POST Button */}
            <button
              onClick={() => setShowPreflightDiagnostics(true)}
              className={`px-2.5 py-1.5 rounded border flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs ${
                hasCompletedPreflight
                  ? 'border-emerald-700/80 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300'
                  : 'border-amber-700/80 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 animate-pulse'
              }`}
              title="Trigger Pre-Flight Sensor Self-Check (Power-On Self-Test)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-bold">
                {hasCompletedPreflight ? 'SENSORS: GOOD TO GO' : 'RUN SENSOR POST'}
              </span>
            </button>

            {/* Mission Pre-Flight Checklist Panel Trigger */}
            <button
              onClick={() => setShowChecklistSidebar(true)}
              className="px-2.5 py-1.5 rounded border border-cyan-800/80 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Open Pre-Flight Mission Checklist Sidebar"
            >
              <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-bold">FLIGHT CHECKLIST</span>
            </button>

            {/* Audio telemetry chirps */}
            <button
              onClick={() => setAudioBeep((b) => !b)}
              className={`px-2.5 py-1.5 rounded border flex items-center gap-1.5 transition-colors ${
                audioBeep
                  ? 'bg-cyan-950/50 border-cyan-800 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title="Toggle Telemetry Audio Pips"
            >
              {audioBeep ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="text-[11px]">{audioBeep ? 'Audio ON' : 'Muted'}</span>
            </button>

            {/* Clickable USB Link Status button */}
            <button
              onClick={() => setShowUsbModal(true)}
              className={`px-2.5 py-1.5 rounded border flex items-center gap-1.5 transition-colors cursor-pointer ${
                serialStatus.connected
                  ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
              title="Configure USB Hardware or Virtual Transceiver"
            >
              <Usb className="w-3.5 h-3.5" />
              <span className="text-[11px]">
                {serialStatus.connected ? `${serialStatus.portName.split(' ')[0]} Active` : 'USB Disconnected'}
              </span>
            </button>

            {/* Simulation toggle */}
            <button
              onClick={toggleSimulation}
              className={`px-2.5 py-1.5 rounded border flex items-center gap-1.5 transition-colors ${
                isSimulating
                  ? 'bg-amber-950/50 border-amber-800 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle Flight Simulator"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[11px]">
                {isSimulating ? 'Sim Stream' : 'Sim Paused'}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Viewport Routing - Gated behind Pre-Flight Sensor Diagnostics */}
        {!hasCompletedPreflight ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center my-6 rounded-xl border border-dashed border-cyan-800/50 bg-[#070c18]/80 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/90 border-2 border-cyan-500/60 flex items-center justify-center text-cyan-400 mb-4 animate-pulse shadow-xl shadow-cyan-950/60">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-cyan-950/90 border border-cyan-800 text-cyan-300 font-mono text-xs mb-3">
              <Activity className="w-3.5 h-3.5 animate-spin" />
              <span>AVIONICS SENSOR DIAGNOSTIC GATE ACTIVE</span>
            </div>
            <h2 className="text-xl font-mono font-bold text-slate-100 max-w-lg mb-2">
              Pre-Flight Sensor Interrogation Required
            </h2>
            <p className="text-xs font-mono text-slate-400 max-w-lg mb-6 leading-relaxed">
              Before displaying live mission telemetry, Orbitra ’26 checks every flight sensor (ESP32, BMP280, MPU6050, DHT11, NEO-6M, LiPo Rail, Servo, Radio Link) and verifies calibration tolerances.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setShowPreflightDiagnostics(true)}
                className="px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-900/50 cursor-pointer transition-all hover:scale-105"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Launch Sensor Self-Test (POST)</span>
              </button>
              <button
                onClick={() => setHasCompletedPreflight(true)}
                className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span>Bypass & Show Telemetry</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'live' && (
              <LiveValuesView
                packet={currentPacket}
                history={history}
                hzRate={hzRate}
                rules={thresholdRules}
                onConnectUsb={handleUsbConnectToggle}
                onOpenUsbTab={() => setActiveTab('usb')}
                onStartSim={toggleSimulation}
                isUsbConnected={serialStatus.connected}
              />
            )}

            {activeTab === 'plots' && (
              <TimeSeriesView
                history={history}
                isPaused={isPaused}
                onTogglePause={() => setIsPaused((p) => !p)}
                onClearHistory={() => setHistory([])}
              />
            )}

            {activeTab === 'openmct' && (
              <OpenMctView
                packet={currentPacket}
                history={history}
                hzRate={hzRate}
              />
            )}

            {activeTab === 'sensors' && (
              <SensorShowcaseView />
            )}

            {activeTab === 'pipeline' && (
              <HardwarePipelineView
                onTriggerLaunch={() => simulationService.triggerLaunch()}
                onTriggerParachute={() => simulationService.triggerParachute()}
                onResetSimulation={() => simulationService.reset()}
                isSimulating={isSimulating}
              />
            )}

            {activeTab === 'usb' && (
              <UsbCommandDeck
                currentPacket={currentPacket}
                onSimulateLaunch={() => simulationService.triggerLaunch()}
                onSimulateParachute={() => simulationService.triggerParachute()}
                isSimulating={isSimulating}
              />
            )}

            {activeTab === 'cubesat' && (
              <CubeSatShowcaseView
                currentPacket={currentPacket}
                onGoToCommandCenter={() => setActiveTab('live')}
                onOpenTeamModal={() => setShowTeamModal(true)}
              />
            )}

            {activeTab === 'admin' && (
              <AdminPortalView
                currentPacket={currentPacket}
                onExitAdmin={() => setActiveTab('live')}
              />
            )}
          </>
        )}
      </main>


      {/* Mission Pre-Flight Checklist Sidebar Panel */}
      <MissionChecklistSidebar
        isOpen={showChecklistSidebar}
        onClose={() => setShowChecklistSidebar(false)}
        currentPacket={currentPacket}
        hzRate={hzRate}
      />

      {/* Team Sputnik Modal */}
      <TeamSputnikModal
        isOpen={showTeamModal}
        onClose={() => setShowTeamModal(false)}
      />

      {/* USB Hardware Connection Modal */}
      <UsbConnectModal
        isOpen={showUsbModal}
        onClose={() => setShowUsbModal(false)}
        onOpenUsbTab={() => setActiveTab('usb')}
      />

      {/* Mission Threshold Limits & Alert Calibration Modal */}
      <ThresholdConfigModal
        isOpen={showThresholdModal}
        onClose={() => setShowThresholdModal(false)}
        incidents={alarmIncidents}
        onClearIncidents={() => {
          thresholdService.clearIncidents();
          setAlarmIncidents([]);
        }}
      />

      {/* Avionics Power-On Self-Test (POST) Sensor Diagnostics Modal */}
      <PreFlightDiagnosticsModal
        isOpen={showPreflightDiagnostics}
        onComplete={() => {
          setHasCompletedPreflight(true);
          setShowPreflightDiagnostics(false);
        }}
        onDismiss={() => {
          setHasCompletedPreflight(true);
          setShowPreflightDiagnostics(false);
        }}
      />

      {/* Supabase Cloud Backend Management & Sync Modal */}
      <SupabaseSyncModal
        isOpen={showSupabaseModal}
        onClose={() => setShowSupabaseModal(false)}
        currentPacket={currentPacket}
      />


      {/* Quiet Footer */}
      <footer className="border-t border-slate-900 px-6 py-4 mt-8 bg-slate-950/80 text-xs font-mono text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span>ORBITRA ’26 CAN-SAT MISSION CONTROL</span>
          <span>·</span>
          <span>TEAM SPUTNIK</span>
          <span>·</span>
          <span>MADAN MOHAN MALVIYA UNIVERSITY OF TECHNOLOGY, GORAKHPUR</span>
        </div>
        <div className="flex items-center gap-3">
          <span>STREAM: {serialStatus.connected ? 'USB HARDWARE' : 'FLIGHT SIMULATOR'}</span>
          <span>·</span>
          <span className={hasCompletedPreflight ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
            {hasCompletedPreflight ? 'POST: ALL SENSORS NOMINAL (GOOD TO GO)' : 'POST: DIAGNOSTICS PENDING'}
          </span>
          <span>·</span>
          <span className="text-cyan-400">TELEMETRY LINK ACTIVE</span>
        </div>
      </footer>
    </div>
  );
}
