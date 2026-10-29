import React, { useState, useEffect } from 'react';
import { 
  supabaseService, 
  SUPABASE_PROJECT_ID, 
  SUPABASE_URL,
  MissionDataEntry 
} from '../services/supabaseService';
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  Copy, 
  Check, 
  ExternalLink, 
  Send, 
  FileText, 
  Sliders, 
  Radio, 
  ShieldCheck, 
  X,
  Layers,
  Sparkles,
  RefreshCw,
  Clock
} from 'lucide-react';
import { TelemetryPacket } from '../types/telemetry';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPacket?: TelemetryPacket | null;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({
  isOpen,
  onClose,
  currentPacket,
}) => {
  const [syncState, setSyncState] = useState(supabaseService.getState());
  const [activeTab, setActiveTab] = useState<'fill_form' | 'table_status' | 'sql_setup' | 'live_records'>('fill_form');
  const [copiedSql, setCopiedSql] = useState(false);

  // Form State for User Input
  const [formCategory, setFormCategory] = useState<string>('Avionics Calibration');
  const [formTitle, setFormTitle] = useState<string>('Pre-Launch Sensor Zero Datum & Ground Verification');
  const [formOperator, setFormOperator] = useState<string>('Priyanshu Yadav (Lead Avionics)');
  const [formStatus, setFormStatus] = useState<'NOMINAL' | 'VERIFIED' | 'WARNING' | 'ALERT' | 'INFO'>('VERIFIED');
  const [formNotes, setFormNotes] = useState<string>(
    'BMP280 zeroed at 184.2m QNH ground altitude. MPU6050 gyro bias nulled to 0.0 deg/sec. 2S LiPo pack stable at 8.38V.'
  );
  const [customParams, setCustomParams] = useState({
    altitude: currentPacket ? currentPacket.altitude.toFixed(1) : '184.2',
    voltage: currentPacket ? currentPacket.voltage.toFixed(2) : '8.38',
    temperature: currentPacket ? currentPacket.tempInternal.toFixed(1) : '28.4',
    humidity: currentPacket?.humidity ? currentPacket.humidity.toFixed(0) : '56',
    rssi: currentPacket ? currentPacket.rssi.toString() : '-68',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Records list
  const [recentRecords, setRecentRecords] = useState<MissionDataEntry[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  useEffect(() => {
    const unsub = supabaseService.subscribe((state) => {
      setSyncState(state);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRecentRecords();
    }
  }, [isOpen, activeTab]);

  const loadRecentRecords = async () => {
    setIsLoadingRecords(true);
    const records = await supabaseService.getRecentMissionData(20);
    setRecentRecords(records);
    setIsLoadingRecords(false);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(supabaseService.getSetupSql());
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleCheckTables = async () => {
    await supabaseService.testConnection();
    await loadRecentRecords();
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

    const result = await supabaseService.saveMissionData({
      title: formTitle.trim(),
      category: formCategory,
      operator: formOperator.trim(),
      notes: formNotes.trim(),
      status: formStatus,
      payload: {
        ...customParams,
        source: 'Orbitra Telemetry UI Form',
        recordedAt: new Date().toISOString(),
        packetCount: currentPacket?.packetCount ?? 0,
      },
    });

    setIsSubmitting(false);

    if (result.success) {
      setSubmitSuccess(`Data successfully saved to Supabase table [mission_data]! Row ID: ${result.data?.id || 'OK'}`);
      await loadRecentRecords();
      setTimeout(() => setSubmitSuccess(null), 4000);
    } else {
      setSubmitError(
        `Failed to save to Supabase: ${result.error}. (Tip: If tables aren't created in your Supabase project yet, click the '1-Click SQL Setup' tab to copy & run the table creation query).`
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-[#090d16] border border-cyan-800/80 rounded-xl shadow-2xl shadow-cyan-950/70 flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-[#0d1627] to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono tracking-tight text-slate-100">
                  Supabase Cloud Backend
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                  Project: {SUPABASE_PROJECT_ID}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Endpoint: <span className="text-cyan-400">{SUPABASE_URL}</span> · Real-time persistence enabled
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/70 px-6 gap-2 text-xs font-mono">
          <button
            onClick={() => setActiveTab('fill_form')}
            className={`px-4 py-3 font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'fill_form'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Fill & Save Mission Data</span>
          </button>

          <button
            onClick={() => setActiveTab('table_status')}
            className={`px-4 py-3 font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'table_status'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Tables Status ({Object.values(syncState.tablesStatus).filter(Boolean).length}/6)</span>
          </button>

          <button
            onClick={() => setActiveTab('live_records')}
            className={`px-4 py-3 font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'live_records'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Saved Records ({syncState.totalSyncedCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('sql_setup')}
            className={`px-4 py-3 font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'sql_setup'
                ? 'border-amber-400 text-amber-400 bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>1-Click SQL Setup</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Supabase Connection</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-mono font-bold text-emerald-400">ONLINE</span>
              </div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Synced To Cloud</span>
              <span className="text-xs font-mono font-bold text-cyan-400 mt-1 block">
                {syncState.totalSyncedCount} Records
              </span>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Last Sync</span>
              <span className="text-xs font-mono font-bold text-slate-300 mt-1 block">
                {syncState.lastSyncTime || 'Pending Activity'}
              </span>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-400 block uppercase">Telemetry Auto-Stream</span>
                <span className="text-xs font-mono font-bold text-slate-300 mt-1 block">
                  {syncState.autoStreamTelemetry ? 'Enabled (2.5s)' : 'Disabled'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={syncState.autoStreamTelemetry}
                onChange={(e) => supabaseService.setAutoStreamTelemetry(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-700 cursor-pointer"
              />
            </div>
          </div>

          {/* TAB 1: Fill & Save Form */}
          {activeTab === 'fill_form' && (
            <div className="space-y-4">
              <div className="p-4 bg-cyan-950/30 border border-cyan-800/40 rounded-lg">
                <h3 className="text-sm font-bold font-mono text-cyan-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  Mission Data Entry Form
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Fill in any mission details, sensor calibrations, notes, or pre-flight signoffs below.
                  Submitting will immediately persist the data into your Supabase table (<code className="text-cyan-300 bg-cyan-950/80 px-1 py-0.5 rounded">mission_data</code>).
                </p>
              </div>

              {submitSuccess && (
                <div className="p-3.5 bg-emerald-950/80 border border-emerald-600 rounded-lg flex items-start gap-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{submitSuccess}</span>
                </div>
              )}

              {submitError && (
                <div className="p-3.5 bg-amber-950/80 border border-amber-600 rounded-lg flex items-start gap-2.5 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <div>{submitError}</div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('sql_setup')}
                      className="px-2 py-1 bg-amber-800 hover:bg-amber-700 text-white font-mono text-[11px] rounded transition-colors"
                    >
                      Open 1-Click SQL Setup →
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitForm} className="space-y-4 bg-slate-900/50 p-5 rounded-lg border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">
                      Mission Category
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="Avionics Calibration">Avionics Calibration & Zero Datum</option>
                      <option value="Power Subsystem">Power & 2S LiPo Verification</option>
                      <option value="Recovery Subsystem">Recovery & Parachute Servo Check</option>
                      <option value="RF Link & Telemetry">RF SX1278 Ground Link Budget</option>
                      <option value="Environmental Test">DHT11 / Barometer Chamber Test</option>
                      <option value="Safety & Range Control">Safety Officer Pre-Launch Clearance</option>
                      <option value="General Mission Note">General Mission Observation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">
                      Status Evaluation
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="VERIFIED">VERIFIED (Nominal GO)</option>
                      <option value="NOMINAL">NOMINAL</option>
                      <option value="WARNING">WARNING (Monitor Required)</option>
                      <option value="ALERT">ALERT (Subsystem Hold)</option>
                      <option value="INFO">INFO (Log Entry Only)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">
                      Record Title / Test Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Flight Core Baro QNH Datum Calibration"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">
                      Responsible Engineer / Operator
                    </label>
                    <input
                      type="text"
                      required
                      value={formOperator}
                      onChange={(e) => setFormOperator(e.target.value)}
                      placeholder="e.g. Priyanshu Yadav (Lead Avionics)"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Subsystem Telemetry Payload Values */}
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>Observed Calibration Values (JSON Payload in Supabase)</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentPacket) {
                          setCustomParams({
                            altitude: currentPacket.altitude.toFixed(1),
                            voltage: currentPacket.voltage.toFixed(2),
                            temperature: currentPacket.tempInternal.toFixed(1),
                            humidity: (currentPacket.humidity || 55).toFixed(0),
                            rssi: currentPacket.rssi.toString(),
                          });
                        }
                      }}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Grab Live Telemetry Snapshot
                    </button>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                      <span className="text-[10px] font-mono text-slate-500 block">Altitude (m)</span>
                      <input
                        type="text"
                        value={customParams.altitude}
                        onChange={(e) => setCustomParams({ ...customParams, altitude: e.target.value })}
                        className="w-full bg-transparent border-none text-xs font-mono text-cyan-300 focus:outline-none mt-0.5"
                      />
                    </div>
                    <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                      <span className="text-[10px] font-mono text-slate-500 block">Voltage (V)</span>
                      <input
                        type="text"
                        value={customParams.voltage}
                        onChange={(e) => setCustomParams({ ...customParams, voltage: e.target.value })}
                        className="w-full bg-transparent border-none text-xs font-mono text-cyan-300 focus:outline-none mt-0.5"
                      />
                    </div>
                    <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                      <span className="text-[10px] font-mono text-slate-500 block">Temp (°C)</span>
                      <input
                        type="text"
                        value={customParams.temperature}
                        onChange={(e) => setCustomParams({ ...customParams, temperature: e.target.value })}
                        className="w-full bg-transparent border-none text-xs font-mono text-cyan-300 focus:outline-none mt-0.5"
                      />
                    </div>
                    <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                      <span className="text-[10px] font-mono text-slate-500 block">Humidity (%)</span>
                      <input
                        type="text"
                        value={customParams.humidity}
                        onChange={(e) => setCustomParams({ ...customParams, humidity: e.target.value })}
                        className="w-full bg-transparent border-none text-xs font-mono text-cyan-300 focus:outline-none mt-0.5"
                      />
                    </div>
                    <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                      <span className="text-[10px] font-mono text-slate-500 block">RSSI (dBm)</span>
                      <input
                        type="text"
                        value={customParams.rssi}
                        onChange={(e) => setCustomParams({ ...customParams, rssi: e.target.value })}
                        className="w-full bg-transparent border-none text-xs font-mono text-cyan-300 focus:outline-none mt-0.5"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    Notes, Observations & Safety Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Enter engineering notes, sensor telemetry findings, or signoff reasons..."
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-mono text-slate-400">
                    Saves to Supabase: <code className="text-slate-300">https://cwtsrgryvbcqlshjoovu.supabase.co</code>
                  </span>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-mono text-xs font-semibold rounded flex items-center gap-2 shadow-lg shadow-cyan-950/40 transition-colors cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving to Supabase...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Save Record To Supabase</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Table Status */}
          {activeTab === 'table_status' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold font-mono text-slate-100">
                    Database Tables & Sync State
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Target database on Supabase project: <span className="text-cyan-400">{SUPABASE_PROJECT_ID}</span>
                  </p>
                </div>
                <button
                  onClick={handleCheckTables}
                  disabled={syncState.checking}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncState.checking ? 'animate-spin' : ''}`} />
                  <span>Verify Tables</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    table: 'mission_data',
                    title: 'Mission Data & Forms',
                    desc: 'User-submitted records, calibrations, engineering notes, and signoffs.',
                    status: syncState.tablesStatus.mission_data,
                  },
                  {
                    table: 'mission_checklists',
                    title: 'Mission Checklists',
                    desc: 'Subsystem readiness checks (Power, RF, Avionics, Range Safety, Recovery).',
                    status: syncState.tablesStatus.mission_checklists,
                  },
                  {
                    table: 'telemetry_packets',
                    title: 'Live Telemetry Packets',
                    desc: 'BMP280, MPU6050, DHT11, NEO-6M, SX1278 and power rail telemetry logs.',
                    status: syncState.tablesStatus.telemetry_packets,
                  },
                  {
                    table: 'flight_diagnostics',
                    title: 'POST Sensor Diagnostics',
                    desc: 'Avionics Power-On Self-Test (POST) 8-sensor pass/warn verification records.',
                    status: syncState.tablesStatus.flight_diagnostics,
                  },
                  {
                    table: 'threshold_configs',
                    title: 'Safety Thresholds',
                    desc: 'Altitude, temperature, LiPo battery voltage, and freefall threshold limits.',
                    status: syncState.tablesStatus.threshold_configs,
                  },
                  {
                    table: 'command_logs',
                    title: 'USB Command Logs',
                    desc: 'Transceiver uplink telecommand history (TX packets and ground status).',
                    status: syncState.tablesStatus.command_logs,
                  },
                ].map((item) => (
                  <div
                    key={item.table}
                    className={`p-4 rounded-lg border flex flex-col justify-between ${
                      item.status
                        ? 'bg-emerald-950/20 border-emerald-800/60'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {item.title}
                        </span>
                        {item.status ? (
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Ready & Synced
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Awaiting Schema
                          </span>
                        )}
                      </div>
                      <code className="text-[11px] font-mono text-cyan-400 block mt-1">
                        public.{item.table}
                      </code>
                      <p className="text-xs text-slate-400 mt-2 font-mono">{item.desc}</p>
                    </div>

                    {!item.status && (
                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>Cached locally until SQL run</span>
                        <button
                          onClick={() => setActiveTab('sql_setup')}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold"
                        >
                          Copy SQL Script →
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Saved Records */}
          {activeTab === 'live_records' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold font-mono text-slate-100">
                    Recently Saved Mission Records
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Retrieved directly from table <span className="text-cyan-400">public.mission_data</span>
                  </p>
                </div>
                <button
                  onClick={loadRecentRecords}
                  disabled={isLoadingRecords}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecords ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {recentRecords.length === 0 ? (
                <div className="text-center py-10 bg-slate-900/40 rounded-lg border border-slate-800 space-y-3">
                  <Database className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-mono text-slate-400">
                    No mission records found in Supabase yet.
                  </p>
                  <button
                    onClick={() => setActiveTab('fill_form')}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs rounded transition-colors"
                  >
                    Fill & Save Your First Record
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {recentRecords.map((rec: any, idx) => (
                    <div
                      key={rec.id || idx}
                      className="p-3.5 bg-slate-900/70 border border-slate-800 hover:border-cyan-800/60 rounded-lg transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-100">
                            {rec.title}
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300">
                            {rec.category}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-mono rounded font-semibold ${
                            rec.status === 'VERIFIED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : rec.status === 'WARNING'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 font-mono">{rec.notes}</p>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                        <span>Operator: <span className="text-slate-300">{rec.operator}</span></span>
                        <span>{rec.created_at ? new Date(rec.created_at).toLocaleTimeString() : 'Just now'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 1-Click SQL Setup */}
          {activeTab === 'sql_setup' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold font-mono text-amber-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Supabase SQL Table Initializer
                  </h3>
                  <a
                    href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 text-xs font-mono font-semibold rounded bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow transition-colors"
                  >
                    <span>Open Supabase SQL Editor</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <p className="text-xs text-slate-300">
                  Because this is a fresh Supabase project, run this SQL script once in your{' '}
                  <a 
                    href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="underline text-cyan-300 hover:text-cyan-200"
                  >
                    Supabase SQL Editor
                  </a>{' '}
                  to create the 6 tables (<code className="text-cyan-300">mission_data</code>, <code className="text-cyan-300">mission_checklists</code>, <code className="text-cyan-300">telemetry_packets</code>, etc.) and public Row-Level Security policies.
                </p>
              </div>

              <div className="relative">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border border-slate-800 border-b-0 rounded-t-lg">
                  <span className="text-xs font-mono text-slate-400">
                    orbitra_sputnik_supabase_schema.sql
                  </span>
                  <button
                    onClick={handleCopySql}
                    className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedSql ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Complete SQL Script</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 bg-[#050811] border border-slate-800 rounded-b-lg text-[11px] font-mono text-cyan-300/90 overflow-x-auto max-h-[300px]">
                  {supabaseService.getSetupSql()}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-mono text-slate-400">
                  Ran the script in Supabase?
                </span>
                <button
                  onClick={handleCheckTables}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs rounded flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Verify Tables in Supabase</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <span>Project ID: <span className="text-slate-200">{SUPABASE_PROJECT_ID}</span></span>
            <span>·</span>
            <span>Key: <code className="text-slate-400">sb_publishable_xWR...</code></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
