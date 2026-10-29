import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TelemetryPacket } from '../types/telemetry';
import { ChecklistItem } from '../types/checklist';
import { ThresholdConfig, AlarmIncident } from '../types/thresholds';

export const SUPABASE_PROJECT_ID = 'cwtsrgryvbcqlshjoovu';
export const SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xWRP9xsUe0Iy8jE7ekX5zw_zOApbfso';

export interface MissionDataEntry {
  id?: number;
  title: string;
  category: string;
  operator: string;
  notes: string;
  status: 'NOMINAL' | 'VERIFIED' | 'WARNING' | 'ALERT' | 'INFO';
  payload?: Record<string, any>;
  created_at?: string;
}

export interface SupabaseSyncState {
  connected: boolean;
  checking: boolean;
  lastSyncTime: string | null;
  totalSyncedCount: number;
  failedCount: number;
  autoStreamTelemetry: boolean;
  tablesStatus: {
    mission_data: boolean;
    mission_checklists: boolean;
    telemetry_packets: boolean;
    flight_diagnostics: boolean;
    threshold_configs: boolean;
    command_logs: boolean;
  };
  lastErrorMessage: string | null;
}

class SupabaseService {
  private client: SupabaseClient;
  private state: SupabaseSyncState = {
    connected: false,
    checking: false,
    lastSyncTime: null,
    totalSyncedCount: 0,
    failedCount: 0,
    autoStreamTelemetry: true,
    tablesStatus: {
      mission_data: false,
      mission_checklists: false,
      telemetry_packets: false,
      flight_diagnostics: false,
      threshold_configs: false,
      command_logs: false,
    },
    lastErrorMessage: null,
  };

  private listeners: Array<(state: SupabaseSyncState) => void> = [];
  private lastTelemetryStreamTime = 0;
  private telemetryStreamIntervalMs = 2500; // Throttle telemetry save to Supabase every 2.5s

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: false,
      },
    });

    // Check status on startup
    this.testConnection();
  }

  public getClient(): SupabaseClient {
    return this.client;
  }

  public getState(): SupabaseSyncState {
    return { ...this.state };
  }

  public subscribe(listener: (state: SupabaseSyncState) => void): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((l) => l(currentState));
  }

  public setAutoStreamTelemetry(enabled: boolean) {
    this.state.autoStreamTelemetry = enabled;
    this.notify();
  }

  public async testConnection(): Promise<{ success: boolean; tables: Record<string, boolean>; message?: string }> {
    this.state.checking = true;
    this.notify();

    const tablesToCheck = [
      'mission_data',
      'mission_checklists',
      'telemetry_packets',
      'flight_diagnostics',
      'threshold_configs',
      'command_logs',
    ] as const;

    const tablesStatus: Record<string, boolean> = { ...this.state.tablesStatus };
    let connectedToApi = false;
    let anyTableFound = false;

    for (const table of tablesToCheck) {
      try {
        const { error } = await this.client.from(table).select('id').limit(1);
        if (!error) {
          tablesStatus[table] = true;
          connectedToApi = true;
          anyTableFound = true;
        } else {
          tablesStatus[table] = false;
          // If error is PGRST205 (table not found), API is reachable, but table schema needs to be executed
          if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
            connectedToApi = true;
          }
        }
      } catch (err) {
        tablesStatus[table] = false;
      }
    }

    this.state.connected = connectedToApi;
    this.state.checking = false;
    this.state.tablesStatus = tablesStatus as any;
    if (!anyTableFound && connectedToApi) {
      this.state.lastErrorMessage = 'Supabase API connected! Run the 1-click SQL setup to enable table persistence.';
    } else {
      this.state.lastErrorMessage = null;
    }
    this.notify();

    return {
      success: connectedToApi,
      tables: tablesStatus,
      message: this.state.lastErrorMessage || 'Connected to Supabase project cwtsrgryvbcqlshjoovu',
    };
  }

  /**
   * Save any filled mission data form to Supabase
   */
  public async saveMissionData(entry: {
    title: string;
    category: string;
    operator: string;
    notes: string;
    status: 'NOMINAL' | 'VERIFIED' | 'WARNING' | 'ALERT' | 'INFO';
    payload?: Record<string, any>;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const payloadToSave = {
        title: entry.title,
        category: entry.category,
        operator: entry.operator || 'Flight Controller',
        notes: entry.notes || '',
        status: entry.status || 'NOMINAL',
        payload: entry.payload || {},
      };

      const { data, error } = await this.client
        .from('mission_data')
        .insert([payloadToSave])
        .select();

      if (error) {
        // If table doesn't exist yet, save to localStorage queue as fallback
        this.cacheLocalBackup('mission_data', payloadToSave);
        this.state.failedCount++;
        this.state.lastErrorMessage = `Supabase Error (${error.code}): ${error.message}`;
        this.notify();
        return { success: false, error: error.message };
      }

      this.state.totalSyncedCount++;
      this.state.lastSyncTime = new Date().toLocaleTimeString();
      this.state.lastErrorMessage = null;
      this.state.tablesStatus.mission_data = true;
      this.notify();
      return { success: true, data: data?.[0] };
    } catch (err: any) {
      this.state.failedCount++;
      this.state.lastErrorMessage = err.message || 'Unknown network error';
      this.notify();
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch recent mission records saved in Supabase
   */
  public async getRecentMissionData(limit = 20): Promise<MissionDataEntry[]> {
    try {
      const { data, error } = await this.client
        .from('mission_data')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (error) {
        // Return local backups if table not yet created
        return this.getLocalBackups('mission_data');
      }
      return data || [];
    } catch (err) {
      return this.getLocalBackups('mission_data');
    }
  }

  /**
   * Save a checklist item update to Supabase
   */
  public async saveChecklistItem(
    item: ChecklistItem,
    notes?: string,
    signedBy?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const row = {
        item_id: item.id,
        title: item.title,
        category: item.category,
        status: item.status,
        description: item.description,
        responsible: item.responsible,
        telemetry_param: item.telemetryParam || null,
        nominal_criteria: item.nominalCriteria,
        notes: notes || '',
        signed_by: signedBy || 'Flight Director',
        updated_at: new Date().toISOString(),
      };

      // Also create an entry in mission_data for unified history
      this.saveMissionData({
        title: `Checklist [${item.id}]: ${item.title} -> ${item.status}`,
        category: `Checklist (${item.category})`,
        operator: signedBy || item.responsible,
        notes: notes || `Marked as ${item.status}. Criteria: ${item.nominalCriteria}`,
        status: item.status === 'GO' ? 'VERIFIED' : item.status === 'NO_GO' ? 'ALERT' : 'INFO',
        payload: { itemId: item.id, itemStatus: item.status, criteria: item.nominalCriteria },
      });

      const { error } = await this.client
        .from('mission_checklists')
        .insert([row]);

      if (error) {
        this.cacheLocalBackup('mission_checklists', row);
        return { success: false, error: error.message };
      }

      this.state.totalSyncedCount++;
      this.state.lastSyncTime = new Date().toLocaleTimeString();
      this.state.tablesStatus.mission_checklists = true;
      this.notify();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Save Pre-Flight Diagnostics POST run
   */
  public async saveDiagnosticsRun(run: {
    runId: string;
    operator: string;
    status: 'ALL_PASS' | 'WARNINGS' | 'INCOMPLETE';
    passedCount: number;
    totalCount: number;
    items: any[];
    logs: string[];
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        run_id: run.runId,
        operator: run.operator,
        status: run.status,
        passed_count: run.passedCount,
        total_count: run.totalCount,
        items: run.items,
        logs: run.logs,
      };

      // Also log into mission_data
      this.saveMissionData({
        title: `Pre-Flight POST Diagnostics: ${run.status} (${run.passedCount}/${run.totalCount} Passed)`,
        category: 'Avionics Diagnostics',
        operator: run.operator,
        notes: `Sensors verified: ${run.items.map((i) => `${i.name}: ${i.status}`).join(', ')}`,
        status: run.status === 'ALL_PASS' ? 'VERIFIED' : 'WARNING',
        payload: { runId: run.runId, passed: run.passedCount, total: run.totalCount },
      });

      const { error } = await this.client
        .from('flight_diagnostics')
        .insert([payload]);

      if (error) {
        this.cacheLocalBackup('flight_diagnostics', payload);
        return { success: false, error: error.message };
      }

      this.state.totalSyncedCount++;
      this.state.lastSyncTime = new Date().toLocaleTimeString();
      this.state.tablesStatus.flight_diagnostics = true;
      this.notify();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Save updated safety thresholds
   */
  public async saveThresholdConfig(
    config: ThresholdConfig,
    updatedBy = 'Safety Officer'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const row = {
        config_name: "ORBITRA '26 Active Flight Limits",
        altitude_max_warning: config.altitudeMaxWarning,
        altitude_max_critical: config.altitudeMaxCritical,
        temp_internal_warning: config.tempInternalWarning,
        temp_internal_critical: config.tempInternalCritical,
        voltage_min_warning: config.voltageMinWarning,
        voltage_min_critical: config.voltageMinCritical,
        rssi_min_warning: config.rssiMinWarning,
        rssi_min_critical: config.rssiMinCritical,
        descent_critical: config.descentVelocityCritical,
        accel_warning: config.accelMaxWarning,
        updated_by: updatedBy,
      };

      this.saveMissionData({
        title: `Flight Threshold Safety Limits Updated`,
        category: 'Safety & Limits',
        operator: updatedBy,
        notes: `Alt Max: ${config.altitudeMaxCritical}m, Temp Max: ${config.tempInternalCritical}°C, Battery Min: ${config.voltageMinCritical}V`,
        status: 'INFO',
        payload: config,
      });

      const { error } = await this.client
        .from('threshold_configs')
        .insert([row]);

      if (error) {
        this.cacheLocalBackup('threshold_configs', row);
        return { success: false, error: error.message };
      }

      this.state.totalSyncedCount++;
      this.state.lastSyncTime = new Date().toLocaleTimeString();
      this.state.tablesStatus.threshold_configs = true;
      this.notify();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Save Transmitted USB command
   */
  public async saveCommandLog(command: string, label = 'Uplink Command', operator = 'Ground Transceiver'): Promise<void> {
    try {
      const row = {
        command_code: command,
        label,
        payload: command,
        direction: 'TX',
        status: 'TRANSMITTED',
        operator,
      };

      this.saveMissionData({
        title: `Uplink TX: ${command}`,
        category: 'Ground Telecommand',
        operator,
        notes: `Transmitted over USB RF transceiver: ${command}`,
        status: 'INFO',
        payload: { command, label },
      });

      const { error } = await this.client
        .from('command_logs')
        .insert([row]);

      if (!error) {
        this.state.totalSyncedCount++;
        this.state.tablesStatus.command_logs = true;
      }
    } catch (e) {
      // ignore non-critical command log failure
    }
  }

  /**
   * Stream live telemetry packet to Supabase (throttled)
   */
  public async streamTelemetryPacket(packet: TelemetryPacket): Promise<void> {
    if (!this.state.autoStreamTelemetry) return;

    const now = Date.now();
    // Throttle to every 2.5s unless critical state transition (Apogee or Touchdown)
    const isCriticalEvent = packet.flightState === 'APOGEE' || packet.flightState === 'TOUCHDOWN';
    if (!isCriticalEvent && now - this.lastTelemetryStreamTime < this.telemetryStreamIntervalMs) {
      return;
    }
    this.lastTelemetryStreamTime = now;

    try {
      const row = {
        packet_count: packet.packetCount,
        team_id: packet.teamId || 'SPUTNIK',
        timestamp: packet.timestamp,
        mission_time: packet.missionTime,
        altitude: packet.altitude,
        peak_altitude: packet.peakAltitude,
        pressure: packet.pressure,
        temp_ambient: packet.tempAmbient,
        temp_internal: packet.tempInternal,
        humidity: packet.humidity,
        voltage: packet.voltage,
        current: packet.current,
        accel_x: packet.accelX,
        accel_y: packet.accelY,
        accel_z: packet.accelZ,
        pitch: packet.pitch,
        roll: packet.roll,
        yaw: packet.yaw,
        descent_rate: packet.descentRate,
        gps_lat: packet.gpsLat,
        gps_lng: packet.gpsLng,
        gps_alt: packet.gpsAlt,
        gps_sats: packet.gpsSats,
        rssi: packet.rssi,
        snr: packet.snr,
        flight_state: packet.flightState,
        raw_string: packet.rawString,
      };

      const { error } = await this.client
        .from('telemetry_packets')
        .insert([row]);

      if (!error) {
        this.state.totalSyncedCount++;
        this.state.lastSyncTime = new Date().toLocaleTimeString();
        this.state.tablesStatus.telemetry_packets = true;
        this.notify();
      }
    } catch (e) {
      // quiet throttling failure
    }
  }

  // Local storage caching for offline / pre-table creation buffering
  private cacheLocalBackup(table: string, payload: any) {
    try {
      const key = `supabase_cache_${table}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift({
        ...payload,
        id: Date.now(),
        created_at: new Date().toISOString(),
        _cachedLocally: true,
      });
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
    } catch {
      // storage full fallback
    }
  }

  private getLocalBackups(table: string): any[] {
    try {
      const key = `supabase_cache_${table}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Fetch all recorded telemetry packets from Supabase
   */
  public async getAllTelemetryPackets(limit = 200, flightState?: string): Promise<any[]> {

    try {
      let query = this.client
        .from('telemetry_packets')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (flightState && flightState !== 'ALL') {
        query = query.eq('flight_state', flightState);
      }

      const { data, error } = await query;
      if (error) {
        return this.getLocalBackups('telemetry_packets');
      }
      return data || [];
    } catch {
      return this.getLocalBackups('telemetry_packets');
    }
  }

  /**
   * Fetch all mission data entries with optional category/search filter
   */
  public async getAllMissionData(limit = 200, category?: string, search?: string): Promise<any[]> {
    try {
      let query = this.client
        .from('mission_data')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (category && category !== 'ALL') {
        query = query.eq('category', category);
      }
      if (search && search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,notes.ilike.%${search.trim()}%,operator.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) {
        return this.getLocalBackups('mission_data');
      }
      return data || [];
    } catch {
      return this.getLocalBackups('mission_data');
    }
  }

  /**
   * Fetch all mission checklist signoffs
   */
  public async getAllChecklistItems(limit = 100): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('mission_checklists')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (error) return this.getLocalBackups('mission_checklists');
      return data || [];
    } catch {
      return this.getLocalBackups('mission_checklists');
    }
  }

  /**
   * Fetch all flight diagnostics runs
   */
  public async getAllDiagnosticsRuns(limit = 100): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('flight_diagnostics')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (error) return this.getLocalBackups('flight_diagnostics');
      return data || [];
    } catch {
      return this.getLocalBackups('flight_diagnostics');
    }
  }

  /**
   * Fetch all threshold configurations
   */
  public async getAllThresholdConfigs(limit = 50): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('threshold_configs')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (error) return this.getLocalBackups('threshold_configs');
      return data || [];
    } catch {
      return this.getLocalBackups('threshold_configs');
    }
  }

  /**
   * Fetch all uplink command logs
   */
  public async getAllCommandLogs(limit = 100): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('command_logs')
        .select('*')
        .order('id', { ascending: false })
        .limit(limit);

      if (error) return this.getLocalBackups('command_logs');
      return data || [];
    } catch {
      return this.getLocalBackups('command_logs');
    }
  }

  /**
   * Delete a record from any table
   */
  public async deleteRecord(table: string, id: number): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.client
        .from(table)
        .delete()
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Clear all records in a table
   */
  public async clearTable(table: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.client
        .from(table)
        .delete()
        .neq('id', 0); // deletes all rows

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get total row counts for all tables
   */
  public async getTableCounts(): Promise<Record<string, number>> {
    const tables = [
      'telemetry_packets',
      'mission_data',
      'mission_checklists',
      'flight_diagnostics',
      'threshold_configs',
      'command_logs',
    ];
    const counts: Record<string, number> = {};

    for (const t of tables) {
      try {
        const { count, error } = await this.client
          .from(t)
          .select('*', { count: 'exact', head: true });
        if (!error && count !== null) {
          counts[t] = count;
        } else {
          counts[t] = 0;
        }
      } catch {
        counts[t] = 0;
      }
    }
    return counts;
  }

  /**
   * SQL Schema Script for 1-Click Copy
   */
  public getSetupSql(): string {

    return `-- ====================================================================
-- TEAM SPUTNIK / ORBITRA '26 TELEMETRY SUPABASE SCHEMA
-- Project ID: cwtsrgryvbcqlshjoovu
-- Copy & Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cwtsrgryvbcqlshjoovu/sql/new
-- ====================================================================

-- 1. All Mission Data & Custom User Forms
CREATE TABLE IF NOT EXISTS public.mission_data (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    operator TEXT DEFAULT 'Mission Controller',
    notes TEXT,
    status TEXT DEFAULT 'NOMINAL',
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Pre-Flight Checklist Table
CREATE TABLE IF NOT EXISTS public.mission_checklists (
    id BIGSERIAL PRIMARY KEY,
    item_id TEXT,
    title TEXT,
    category TEXT,
    status TEXT,
    description TEXT,
    responsible TEXT,
    telemetry_param TEXT,
    nominal_criteria TEXT,
    notes TEXT,
    signed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Live Telemetry Packets Table
CREATE TABLE IF NOT EXISTS public.telemetry_packets (
    id BIGSERIAL PRIMARY KEY,
    packet_count INT,
    team_id TEXT DEFAULT 'SPUTNIK',
    timestamp TEXT,
    mission_time NUMERIC,
    altitude NUMERIC,
    peak_altitude NUMERIC,
    pressure NUMERIC,
    temp_ambient NUMERIC,
    temp_internal NUMERIC,
    humidity NUMERIC,
    voltage NUMERIC,
    current NUMERIC,
    accel_x NUMERIC,
    accel_y NUMERIC,
    accel_z NUMERIC,
    pitch NUMERIC,
    roll NUMERIC,
    yaw NUMERIC,
    descent_rate NUMERIC,
    gps_lat NUMERIC,
    gps_lng NUMERIC,
    gps_alt NUMERIC,
    gps_sats INT,
    rssi NUMERIC,
    snr NUMERIC,
    flight_state TEXT,
    raw_string TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Pre-Flight Sensor POST Diagnostics
CREATE TABLE IF NOT EXISTS public.flight_diagnostics (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT,
    operator TEXT DEFAULT 'Avionics Lead',
    status TEXT,
    passed_count INT,
    total_count INT,
    items JSONB DEFAULT '[]'::jsonb,
    logs JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Safety Thresholds Table
CREATE TABLE IF NOT EXISTS public.threshold_configs (
    id BIGSERIAL PRIMARY KEY,
    config_name TEXT DEFAULT 'Flight Thresholds',
    altitude_max_warning NUMERIC,
    altitude_max_critical NUMERIC,
    temp_internal_warning NUMERIC,
    temp_internal_critical NUMERIC,
    voltage_min_warning NUMERIC,
    voltage_min_critical NUMERIC,
    rssi_min_warning NUMERIC,
    rssi_min_critical NUMERIC,
    descent_critical NUMERIC,
    accel_warning NUMERIC,
    updated_by TEXT DEFAULT 'Ground Safety Officer',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Transceiver Command Logs
CREATE TABLE IF NOT EXISTS public.command_logs (
    id BIGSERIAL PRIMARY KEY,
    command_code TEXT,
    label TEXT,
    payload TEXT,
    direction TEXT DEFAULT 'TX',
    status TEXT DEFAULT 'SENT',
    operator TEXT DEFAULT 'Ground Station',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and public policies for publishable anon key
ALTER TABLE public.mission_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threshold_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read mission_data" ON public.mission_data;
CREATE POLICY "Allow public read mission_data" ON public.mission_data FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert mission_data" ON public.mission_data;
CREATE POLICY "Allow public insert mission_data" ON public.mission_data FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read checklists" ON public.mission_checklists;
CREATE POLICY "Allow public read checklists" ON public.mission_checklists FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert checklists" ON public.mission_checklists;
CREATE POLICY "Allow public insert checklists" ON public.mission_checklists FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update checklists" ON public.mission_checklists;
CREATE POLICY "Allow public update checklists" ON public.mission_checklists FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public read telemetry" ON public.telemetry_packets;
CREATE POLICY "Allow public read telemetry" ON public.telemetry_packets FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert telemetry" ON public.telemetry_packets;
CREATE POLICY "Allow public insert telemetry" ON public.telemetry_packets FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read diagnostics" ON public.flight_diagnostics;
CREATE POLICY "Allow public read diagnostics" ON public.flight_diagnostics FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert diagnostics" ON public.flight_diagnostics;
CREATE POLICY "Allow public insert diagnostics" ON public.flight_diagnostics FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read thresholds" ON public.threshold_configs;
CREATE POLICY "Allow public read thresholds" ON public.threshold_configs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert thresholds" ON public.threshold_configs;
CREATE POLICY "Allow public insert thresholds" ON public.threshold_configs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read commands" ON public.command_logs;
CREATE POLICY "Allow public read commands" ON public.command_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert commands" ON public.command_logs;
CREATE POLICY "Allow public insert commands" ON public.command_logs FOR INSERT WITH CHECK (true);

-- Allow Admin / Client to Delete or Clear rows
DROP POLICY IF EXISTS "Allow public delete mission_data" ON public.mission_data;
CREATE POLICY "Allow public delete mission_data" ON public.mission_data FOR DELETE USING (true);
DROP POLICY IF EXISTS "Allow public delete checklists" ON public.mission_checklists;
CREATE POLICY "Allow public delete checklists" ON public.mission_checklists FOR DELETE USING (true);
DROP POLICY IF EXISTS "Allow public delete telemetry" ON public.telemetry_packets;
CREATE POLICY "Allow public delete telemetry" ON public.telemetry_packets FOR DELETE USING (true);
DROP POLICY IF EXISTS "Allow public delete diagnostics" ON public.flight_diagnostics;
CREATE POLICY "Allow public delete diagnostics" ON public.flight_diagnostics FOR DELETE USING (true);
DROP POLICY IF EXISTS "Allow public delete thresholds" ON public.threshold_configs;
CREATE POLICY "Allow public delete thresholds" ON public.threshold_configs FOR DELETE USING (true);
DROP POLICY IF EXISTS "Allow public delete commands" ON public.command_logs;
CREATE POLICY "Allow public delete commands" ON public.command_logs FOR DELETE USING (true);
`;
  }
}


export const supabaseService = new SupabaseService();
