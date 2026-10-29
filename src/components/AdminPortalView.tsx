import React, { useState, useEffect, useRef } from 'react';
import { 
  supabaseService, 
  SUPABASE_PROJECT_ID, 
  SUPABASE_URL 
} from '../services/supabaseService';
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  KeyRound, 
  Database, 
  RefreshCw, 
  Download, 
  Trash2, 
  Search, 
  Filter, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  Radio, 
  Layers, 
  FileText, 
  Cpu, 
  Clock, 
  CheckSquare, 
  LogOut, 
  Eye, 
  ChevronDown, 
  ChevronRight,
  Sparkles,
  User,
  Sliders,
  Send,
  X
} from 'lucide-react';
import { TelemetryPacket } from '../types/telemetry';

interface AdminPortalViewProps {
  currentPacket?: TelemetryPacket | null;
  onExitAdmin?: () => void;
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  currentPacket,
  onExitAdmin,
}) => {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('orbitra_admin_auth') === 'true';
  });
  const [adminUsername, setAdminUsername] = useState<string>('admin@sputnik.mmmut.ac.in');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active Admin Sub-Tab
  const [activeTab, setActiveTab] = useState<'telemetry' | 'forms' | 'checklist' | 'diagnostics' | 'thresholds' | 'commands'>('telemetry');

  // Data Stores
  const [telemetryRows, setTelemetryRows] = useState<any[]>([]);
  const [missionDataRows, setMissionDataRows] = useState<any[]>([]);
  const [checklistRows, setChecklistRows] = useState<any[]>([]);
  const [diagnosticsRows, setDiagnosticsRows] = useState<any[]>([]);
  const [thresholdRows, setThresholdRows] = useState<any[]>([]);
  const [commandRows, setCommandRows] = useState<any[]>([]);

  // Statistics
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(3); // seconds, 0 = off

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Selected row for detail modal
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ table: string; id: number } | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Login handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    // Default admin credentials for Team Sputnik / MMMUT CanSat Mission Control
    const isValidDefault = 
      (adminUsername.trim().toLowerCase() === 'admin@sputnik.mmmut.ac.in' || adminUsername.trim().toLowerCase() === 'admin') && 
      (adminPassword === 'orbitra2026!' || adminPassword === 'sputnik2026' || adminPassword === 'admin123');

    if (isValidDefault) {
      setIsAuthenticated(true);
      if (rememberMe) {
        localStorage.setItem('orbitra_admin_auth', 'true');
        localStorage.setItem('orbitra_admin_user', adminUsername.trim());
      }
      loadAllData();
    } else {
      setLoginError('Invalid Administrator credentials. Hint: Username "admin" / Password "orbitra2026!"');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('orbitra_admin_auth');
  };

  // Load all table records
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [tPackets, mData, cList, dRuns, tConfigs, cLogs, counts] = await Promise.all([
        supabaseService.getAllTelemetryPackets(250, stateFilter),
        supabaseService.getAllMissionData(200, categoryFilter, searchQuery),
        supabaseService.getAllChecklistItems(100),
        supabaseService.getAllDiagnosticsRuns(50),
        supabaseService.getAllThresholdConfigs(50),
        supabaseService.getAllCommandLogs(100),
        supabaseService.getTableCounts(),
      ]);

      setTelemetryRows(tPackets);
      setMissionDataRows(mData);
      setChecklistRows(cList);
      setDiagnosticsRows(dRuns);
      setThresholdRows(tConfigs);
      setCommandRows(cLogs);
      setTableCounts(counts);
    } catch (err: any) {
      showNotice(`Error loading Supabase records: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh interval
  useEffect(() => {
    if (!isAuthenticated) return;
    loadAllData();

    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      loadAllData();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, autoRefreshInterval, stateFilter, categoryFilter]);

  const showNotice = (msg: string) => {
    setNoticeMessage(msg);
    setTimeout(() => setNoticeMessage(null), 3500);
  };

  // Delete a record
  const handleDeleteRecord = async (table: string, id: number) => {
    const res = await supabaseService.deleteRecord(table, id);
    if (res.success) {
      showNotice(`Deleted row #${id} from [${table}]`);
      loadAllData();
    } else {
      showNotice(`Failed to delete row: ${res.error}`);
    }
    setDeleteConfirmTarget(null);
  };

  // Export current active view to CSV
  const handleExportCsv = () => {
    let rowsToExport: any[] = [];
    let filename = `orbitra_sputnik_${activeTab}_${Date.now()}.csv`;

    if (activeTab === 'telemetry') rowsToExport = telemetryRows;
    else if (activeTab === 'forms') rowsToExport = missionDataRows;
    else if (activeTab === 'checklist') rowsToExport = checklistRows;
    else if (activeTab === 'diagnostics') rowsToExport = diagnosticsRows;
    else if (activeTab === 'thresholds') rowsToExport = thresholdRows;
    else if (activeTab === 'commands') rowsToExport = commandRows;

    if (rowsToExport.length === 0) {
      showNotice('No records to export in the current view.');
      return;
    }

    const headers = Object.keys(rowsToExport[0]).filter(k => k !== 'payload' && k !== 'logs' && k !== 'items');
    const csvContent = [
      headers.join(','),
      ...rowsToExport.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotice(`Exported ${rowsToExport.length} records to CSV!`);
  };

  // Export all database data to a consolidated JSON package
  const handleExportAllJson = () => {
    const fullArchive = {
      mission: "ORBITRA '26 CAN-SAT TELEMETRY ARCHIVE",
      institution: 'Madan Mohan Malviya University of Technology, Gorakhpur',
      team: 'Team Sputnik',
      supabaseProjectId: SUPABASE_PROJECT_ID,
      exportedAt: new Date().toISOString(),
      counts: tableCounts,
      data: {
        telemetryPackets: telemetryRows,
        missionForms: missionDataRows,
        checklists: checklistRows,
        flightDiagnostics: diagnosticsRows,
        thresholdConfigs: thresholdRows,
        commandLogs: commandRows,
      },
    };

    const blob = new Blob([JSON.stringify(fullArchive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orbitra_full_mission_archive_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotice('Exported complete mission database package to JSON!');
  };

  // ==========================================
  // VIEW: LOGIN SCREEN (IF NOT AUTHENTICATED)
  // ==========================================
  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-[#06080d]">
        <div className="w-full max-w-md bg-[#0a0f1d] border border-cyan-800/80 rounded-xl p-8 shadow-2xl shadow-cyan-950/80 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-900/40">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold font-mono text-slate-100 tracking-tight">
              Mission Control Admin Portal
            </h2>
            <p className="text-xs font-mono text-slate-400">
              Team Sputnik · CanSat ORBITRA ’26 · MMMUT Gorakhpur
            </p>
          </div>

          <div className="p-3 bg-cyan-950/30 border border-cyan-800/50 rounded-lg text-xs font-mono text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Authorized Flight Director Access</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Backend Database: <span className="text-cyan-300 font-semibold">cwtsrgryvbcqlshjoovu.supabase.co</span>
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-950/80 border border-rose-700/80 rounded-lg flex items-center gap-2 text-xs text-rose-200 font-mono">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Admin Email / Call Sign</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 pl-9"
                  placeholder="admin@sputnik.mmmut.ac.in"
                />
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Security Key / Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 pl-9"
                  placeholder="Enter security key..."
                />
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              </div>
            </div>

            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded text-[11px] text-slate-400 space-y-1">
              <span className="font-semibold text-cyan-400 block">Default Credentials:</span>
              <div>Username: <code className="text-slate-200 bg-slate-950 px-1 py-0.5 rounded">admin</code></div>
              <div>Password: <code className="text-slate-200 bg-slate-950 px-1 py-0.5 rounded">orbitra2026!</code></div>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-700"
                />
                <span>Remember Session</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setAdminUsername('admin');
                  setAdminPassword('orbitra2026!');
                }}
                className="text-cyan-400 hover:text-cyan-300 underline"
              >
                Auto-fill
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/60 transition-colors cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Authenticate & Enter Admin Portal</span>
            </button>
          </form>

          {onExitAdmin && (
            <div className="text-center pt-2">
              <button
                onClick={onExitAdmin}
                className="text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Return to Live Ground Station View
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: AUTHENTICATED ADMIN COMMAND PORTAL
  // ==========================================
  return (
    <div className="flex-1 flex flex-col p-3 sm:p-5 md:p-6 space-y-5 bg-[#06080d] w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Admin Header HUD */}
      <div className="bg-[#090e1c] border border-cyan-800/80 rounded-xl p-4 md:p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full max-w-full min-w-0">

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-center text-emerald-400 shadow-md">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold font-mono text-slate-100 tracking-tight">
                ADMIN COMMAND PORTAL · SUPABASE DATA VIEWER
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-700/80">
                LIVE PERSISTENCE
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400">
              Project ID: <span className="text-cyan-400 font-semibold">{SUPABASE_PROJECT_ID}</span> · Authenticated as: <span className="text-slate-200 font-semibold">{adminUsername}</span>
            </p>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {/* Auto Refresh Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded">
            <span className="text-slate-500">POLL:</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="bg-transparent text-cyan-300 focus:outline-none cursor-pointer"
            >
              <option value={0}>Manual Only</option>
              <option value={2}>Every 2s</option>
              <option value={3}>Every 3s</option>
              <option value={5}>Every 5s</option>
              <option value={10}>Every 10s</option>
            </select>
          </div>

          <button
            onClick={loadAllData}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Export active table to CSV"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Table CSV</span>
          </button>

          <button
            onClick={handleExportAllJson}
            className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Export all database tables to single JSON package"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export All JSON</span>
          </button>

          <a
            href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/editor`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded flex items-center gap-1.5 transition-colors"
          >
            <span>Supabase Dashboard</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Sign out of Administrator Session"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Notice Message Toast */}
      {noticeMessage && (
        <div className="p-3 bg-cyan-950/90 border border-cyan-700 rounded-lg text-xs font-mono text-cyan-200 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span>{noticeMessage}</span>
          </div>
          <button onClick={() => setNoticeMessage(null)}>
            <X className="w-4 h-4 text-slate-400 hover:text-white" />
          </button>
        </div>
      )}

      {/* Metrics Cards: Live Table Records */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
        {[
          {
            key: 'telemetry',
            table: 'telemetry_packets',
            label: 'Telemetry Packets',
            count: telemetryRows.length,
            color: 'text-cyan-400',
            border: 'border-cyan-800/50',
          },
          {
            key: 'forms',
            table: 'mission_data',
            label: 'Mission Form Data',
            count: missionDataRows.length,
            color: 'text-emerald-400',
            border: 'border-emerald-800/50',
          },
          {
            key: 'checklist',
            table: 'mission_checklists',
            label: 'Checklist Signoffs',
            count: checklistRows.length,
            color: 'text-amber-400',
            border: 'border-amber-800/50',
          },
          {
            key: 'diagnostics',
            table: 'flight_diagnostics',
            label: 'POST Diagnostics',
            count: diagnosticsRows.length,
            color: 'text-violet-400',
            border: 'border-violet-800/50',
          },
          {
            key: 'thresholds',
            table: 'threshold_configs',
            label: 'Threshold Configs',
            count: thresholdRows.length,
            color: 'text-blue-400',
            border: 'border-blue-800/50',
          },
          {
            key: 'commands',
            table: 'command_logs',
            label: 'Command Uplinks',
            count: commandRows.length,
            color: 'text-rose-400',
            border: 'border-rose-800/50',
          },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key as any)}
            className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
              activeTab === item.key
                ? 'bg-slate-900 border-cyan-400 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-400/50'
                : `bg-slate-950/70 ${item.border} hover:bg-slate-900/60`
            }`}
          >
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              {item.label}
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl font-bold ${item.color}`}>
                {item.count}
              </span>
              <span className="text-[10px] text-slate-500">Rows</span>
            </div>
            <code className="text-[9px] text-slate-500 block truncate mt-1">
              {item.table}
            </code>
          </button>
        ))}
      </div>

      {/* Main Admin Tab Navigation */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        {/* Sub-tab strip */}
        <div className="flex flex-wrap border-b border-slate-800 bg-slate-900/60 px-4 gap-2 text-xs font-mono">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`px-4 py-3 border-b-2 font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'telemetry'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>01 Live Telemetry Packets ({telemetryRows.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('forms')}
            className={`px-4 py-3 border-b-2 font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'forms'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>02 User Form Submissions ({missionDataRows.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-4 py-3 border-b-2 font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'checklist'
                ? 'border-amber-400 text-amber-400 bg-amber-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>03 Pre-Flight Checklist ({checklistRows.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-3 border-b-2 font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'diagnostics'
                ? 'border-violet-400 text-violet-400 bg-violet-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>04 POST Diagnostic Runs ({diagnosticsRows.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('thresholds')}
            className={`px-4 py-3 border-b-2 font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'thresholds'
                ? 'border-blue-400 text-blue-400 bg-blue-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>05 Threshold Limits ({thresholdRows.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('commands')}
            className={`px-4 py-3 border-b-2 font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'commands'
                ? 'border-rose-400 text-rose-400 bg-rose-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>06 Command Uplinks ({commandRows.length})</span>
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-3 bg-slate-900/30 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across title, notes, operator, timestamp..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 pl-8 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'telemetry' && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">STAGE:</span>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-cyan-300 rounded px-2 py-1 focus:outline-none"
                >
                  <option value="ALL">All Flight States</option>
                  <option value="PRE_LAUNCH">PRE_LAUNCH</option>
                  <option value="ASCENT">ASCENT</option>
                  <option value="APOGEE">APOGEE</option>
                  <option value="PARACHUTE_DESCENT">PARACHUTE_DESCENT</option>
                  <option value="TOUCHDOWN">TOUCHDOWN</option>
                </select>
              </div>
            )}

            {activeTab === 'forms' && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">CATEGORY:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-cyan-300 rounded px-2 py-1 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="Avionics Calibration">Avionics Calibration</option>
                  <option value="Power Subsystem">Power Subsystem</option>
                  <option value="Recovery Subsystem">Recovery Subsystem</option>
                  <option value="RF Link & Telemetry">RF Link & Telemetry</option>
                  <option value="Environmental Test">Environmental Test</option>
                  <option value="Safety & Range Control">Safety & Range Control</option>
                </select>
              </div>
            )}

            <span className="text-slate-500">
              Showing{' '}
              <span className="text-cyan-400 font-bold">
                {activeTab === 'telemetry'
                  ? telemetryRows.length
                  : activeTab === 'forms'
                  ? missionDataRows.length
                  : activeTab === 'checklist'
                  ? checklistRows.length
                  : activeTab === 'diagnostics'
                  ? diagnosticsRows.length
                  : activeTab === 'thresholds'
                  ? thresholdRows.length
                  : commandRows.length}
              </span>{' '}
              records
            </span>
          </div>
        </div>

        {/* TAB 1: TELEMETRY PACKETS TABLE */}
        {activeTab === 'telemetry' && (
          <div className="overflow-x-auto max-h-[580px] p-2">
            {telemetryRows.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono space-y-2">
                <Radio className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
                <p>No telemetry packets recorded in Supabase table yet.</p>
                <p className="text-xs text-slate-600">
                  Packets automatically stream to <code className="text-cyan-400">telemetry_packets</code> every 2.5s and on apogee / parachute events.
                </p>
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                    <th className="p-2.5">ID / PKT #</th>
                    <th className="p-2.5">TIME (UTC)</th>
                    <th className="p-2.5">STAGE</th>
                    <th className="p-2.5">ALT (m)</th>
                    <th className="p-2.5">BARO (hPa)</th>
                    <th className="p-2.5">TEMP AMB / INT</th>
                    <th className="p-2.5">HUMIDITY</th>
                    <th className="p-2.5">2S VOLT</th>
                    <th className="p-2.5">DESCENT</th>
                    <th className="p-2.5">GPS (LAT, LNG, SATS)</th>
                    <th className="p-2.5">RSSI / SNR</th>
                    <th className="p-2.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {telemetryRows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-900/50 transition-colors group text-slate-300"
                    >
                      <td className="p-2.5 font-bold text-cyan-400">
                        #{row.packet_count || row.id}
                      </td>
                      <td className="p-2.5 text-slate-400">
                        {row.timestamp || '00:00:00'}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            row.flight_state === 'APOGEE'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : row.flight_state === 'TOUCHDOWN'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : row.flight_state === 'PARACHUTE_DESCENT'
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              : row.flight_state === 'ASCENT'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {row.flight_state || 'LIVE'}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-100 font-bold">
                        {row.altitude ? Number(row.altitude).toFixed(1) : '0.0'} m
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {row.pressure ? Number(row.pressure).toFixed(1) : '1013.2'}
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {row.temp_ambient ? Number(row.temp_ambient).toFixed(1) : '--'}°C /{' '}
                        <span className="text-amber-300">{row.temp_internal ? Number(row.temp_internal).toFixed(1) : '--'}°C</span>
                      </td>
                      <td className="p-2.5 text-cyan-300">
                        {row.humidity ? Number(row.humidity).toFixed(0) : '--'}%
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`font-semibold ${
                            Number(row.voltage) < 7.0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {row.voltage ? Number(row.voltage).toFixed(2) : '8.40'}V
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {row.descent_rate ? Number(row.descent_rate).toFixed(2) : '0.00'} m/s
                      </td>
                      <td className="p-2.5 text-slate-400 text-[11px]">
                        {row.gps_lat ? Number(row.gps_lat).toFixed(4) : '26.7321'},{' '}
                        {row.gps_lng ? Number(row.gps_lng).toFixed(4) : '83.4332'}{' '}
                        <span className="text-cyan-400">({row.gps_sats || 8} Sats)</span>
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {row.rssi ? `${row.rssi} dBm` : '-68 dBm'}
                      </td>
                      <td className="p-2.5 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedRow({ ...row, _table: 'telemetry_packets' })}
                          className="p-1 hover:text-cyan-300 rounded hover:bg-slate-800"
                          title="View Full Packet Data"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmTarget({ table: 'telemetry_packets', id: row.id })}
                          className="p-1 text-slate-600 hover:text-rose-400 rounded hover:bg-slate-800"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: USER MISSION DATA FORMS */}
        {activeTab === 'forms' && (
          <div className="overflow-x-auto max-h-[580px] p-2">
            {missionDataRows.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono space-y-2">
                <FileText className="w-8 h-8 mx-auto text-slate-600" />
                <p>No mission records or filled forms recorded in Supabase yet.</p>
                <p className="text-xs text-slate-600">
                  Use the "Fill & Save Data" button in the top bar to record custom flight calibrations.
                </p>
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {missionDataRows.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 bg-slate-900/60 border border-slate-800 hover:border-cyan-800/80 rounded-lg transition-colors font-mono text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-100">
                          {rec.title}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                          {rec.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                            rec.status === 'VERIFIED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : rec.status === 'WARNING'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : rec.status === 'ALERT'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                          }`}
                        >
                          {rec.status}
                        </span>
                        <button
                          onClick={() => setDeleteConfirmTarget({ table: 'mission_data', id: rec.id })}
                          className="p-1 text-slate-600 hover:text-rose-400 rounded hover:bg-slate-800"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-slate-300 text-xs bg-slate-950/60 p-2.5 rounded border border-slate-900">
                      {rec.notes}
                    </p>

                    {rec.payload && Object.keys(rec.payload).length > 0 && (
                      <div className="p-2 bg-[#050811] rounded border border-slate-900/80 text-[11px] text-cyan-300/80">
                        <span className="text-slate-500 font-semibold block mb-1">Payload Variables:</span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(rec.payload).map(([k, v]) => (
                            <span key={k}>
                              <span className="text-slate-400">{k}:</span> <span className="text-cyan-200">{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                      <span>Operator: <span className="text-slate-300">{rec.operator || 'Flight Controller'}</span></span>
                      <span>Recorded: {rec.created_at ? new Date(rec.created_at).toLocaleString() : 'Just now'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CHECKLIST SIGNOFFS */}
        {activeTab === 'checklist' && (
          <div className="overflow-x-auto max-h-[580px] p-2">
            {checklistRows.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono space-y-2">
                <CheckSquare className="w-8 h-8 mx-auto text-slate-600" />
                <p>No checklist updates recorded in Supabase yet.</p>
                <p className="text-xs text-slate-600">
                  Open Mission Checklist and click "Set All GO" or "Save to Supabase" to push items.
                </p>
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                    <th className="p-2.5">ITEM ID</th>
                    <th className="p-2.5">TITLE & SUBSYSTEM</th>
                    <th className="p-2.5">STATUS</th>
                    <th className="p-2.5">RESPONSIBLE LEAD</th>
                    <th className="p-2.5">NOMINAL CRITERIA</th>
                    <th className="p-2.5">SIGNED BY</th>
                    <th className="p-2.5">TIMESTAMP</th>
                    <th className="p-2.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {checklistRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-900/50 text-slate-300">
                      <td className="p-2.5 font-bold text-cyan-400">{row.item_id || row.id}</td>
                      <td className="p-2.5 font-semibold text-slate-200">
                        {row.title}
                        <span className="text-[10px] text-slate-500 block">{row.category}</span>
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.status === 'GO'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : row.status === 'NO_GO'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-300">{row.responsible}</td>
                      <td className="p-2.5 text-slate-400 text-[11px]">{row.nominal_criteria}</td>
                      <td className="p-2.5 text-slate-300">{row.signed_by || 'Ujjwal Yadav'}</td>
                      <td className="p-2.5 text-slate-400 text-[11px]">
                        {row.created_at ? new Date(row.created_at).toLocaleTimeString() : 'Just now'}
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => setDeleteConfirmTarget({ table: 'mission_checklists', id: row.id })}
                          className="p-1 text-slate-600 hover:text-rose-400 rounded hover:bg-slate-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 4: POST DIAGNOSTIC RUNS */}
        {activeTab === 'diagnostics' && (
          <div className="overflow-x-auto max-h-[580px] p-2 space-y-3">
            {diagnosticsRows.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono space-y-2">
                <Cpu className="w-8 h-8 mx-auto text-slate-600" />
                <p>No POST sensor diagnostic test runs recorded in Supabase yet.</p>
              </div>
            ) : (
              diagnosticsRows.map((diag) => (
                <div
                  key={diag.id}
                  className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg font-mono text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100">{diag.run_id}</span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {diag.status} ({diag.passed_count}/{diag.total_count} Passed)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <span>Operator: {diag.operator}</span>
                      <span>·</span>
                      <span>{diag.created_at ? new Date(diag.created_at).toLocaleString() : ''}</span>
                    </div>
                  </div>

                  {/* Logs Snippet */}
                  {Array.isArray(diag.logs) && diag.logs.length > 0 && (
                    <div className="p-2.5 bg-black/70 rounded border border-slate-900 text-[11px] text-cyan-300/90 font-mono max-h-28 overflow-y-auto space-y-0.5">
                      {diag.logs.slice(-6).map((log: string, idx: number) => (
                        <div key={idx}>{log}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 5: THRESHOLD LIMITS */}
        {activeTab === 'thresholds' && (
          <div className="overflow-x-auto max-h-[580px] p-2">
            {thresholdRows.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono space-y-2">
                <Sliders className="w-8 h-8 mx-auto text-slate-600" />
                <p>No threshold calibrations saved in Supabase yet.</p>
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                    <th className="p-2.5">ID</th>
                    <th className="p-2.5">CONFIG NAME</th>
                    <th className="p-2.5">ALT MAX</th>
                    <th className="p-2.5">TEMP INT MAX</th>
                    <th className="p-2.5">BATT MIN</th>
                    <th className="p-2.5">RSSI MIN</th>
                    <th className="p-2.5">UPDATED BY</th>
                    <th className="p-2.5">DATE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {thresholdRows.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-900/50 text-slate-300">
                      <td className="p-2.5 text-cyan-400">#{t.id}</td>
                      <td className="p-2.5 font-bold text-slate-200">{t.config_name}</td>
                      <td className="p-2.5">{t.altitude_max_critical} m</td>
                      <td className="p-2.5">{t.temp_internal_critical} °C</td>
                      <td className="p-2.5 text-emerald-400">{t.voltage_min_critical} V</td>
                      <td className="p-2.5">{t.rssi_min_critical} dBm</td>
                      <td className="p-2.5 text-slate-300">{t.updated_by}</td>
                      <td className="p-2.5 text-slate-500 text-[11px]">
                        {t.created_at ? new Date(t.created_at).toLocaleTimeString() : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 6: COMMAND UPLINKS */}
        {activeTab === 'commands' && (
          <div className="overflow-x-auto max-h-[580px] p-2">
            {commandRows.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono space-y-2">
                <Send className="w-8 h-8 mx-auto text-slate-600" />
                <p>No telecommand uplinks recorded in Supabase yet.</p>
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                    <th className="p-2.5">ID</th>
                    <th className="p-2.5">COMMAND CODE</th>
                    <th className="p-2.5">LABEL</th>
                    <th className="p-2.5">DIRECTION</th>
                    <th className="p-2.5">STATUS</th>
                    <th className="p-2.5">OPERATOR</th>
                    <th className="p-2.5">TIME</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {commandRows.map((cmd) => (
                    <tr key={cmd.id} className="hover:bg-slate-900/50 text-slate-300">
                      <td className="p-2.5 text-cyan-400">#{cmd.id}</td>
                      <td className="p-2.5 font-bold text-amber-300">{cmd.command_code}</td>
                      <td className="p-2.5 text-slate-200">{cmd.label}</td>
                      <td className="p-2.5 text-cyan-400">{cmd.direction || 'TX'}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {cmd.status || 'SENT'}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-300">{cmd.operator}</td>
                      <td className="p-2.5 text-slate-400 text-[11px]">
                        {cmd.created_at ? new Date(cmd.created_at).toLocaleTimeString() : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Row Inspection Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-[#0a0f1d] border border-cyan-800 rounded-xl p-5 shadow-2xl space-y-4 font-mono text-xs max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Record Inspection: #{selectedRow.id} ({selectedRow._table || 'Record'})
                </h3>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="p-1 hover:text-white text-slate-400 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              <pre className="p-3 bg-black/80 border border-slate-800 rounded text-cyan-300 text-[11px] overflow-x-auto">
                {JSON.stringify(selectedRow, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedRow(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#0e111a] border border-rose-800/80 rounded-xl p-5 shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-slate-100 text-sm">Confirm Row Deletion</h3>
            </div>
            <p className="text-slate-300">
              Are you sure you want to delete row #{deleteConfirmTarget.id} from Supabase table{' '}
              <code className="text-rose-300 font-bold">public.{deleteConfirmTarget.table}</code>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRecord(deleteConfirmTarget.table, deleteConfirmTarget.id)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded cursor-pointer shadow-md"
              >
                Delete Row
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
