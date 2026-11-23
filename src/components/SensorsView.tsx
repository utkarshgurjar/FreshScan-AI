import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Check, Copy, Radio, Send } from 'lucide-react';
import type {
  AlertRecord,
  BatchSummary,
  SensorReadingRecord,
  SpoilageWeightsConfig,
} from '../types/freshscan';

interface SensorsViewProps {
  batches: BatchSummary[];
  onAlertsChanged: () => Promise<void>;
}

function thermalCellColor(temp: number, minT: number, maxT: number): string {
  const ratio = maxT <= minT ? 0.5 : Math.max(0, Math.min(1, (temp - minT) / (maxT - minT)));
  if (ratio < 0.25) return '#1D4ED8';
  if (ratio < 0.5) return '#0D9488';
  if (ratio < 0.72) return '#D97706';
  return '#DC2626';
}

export function SensorsView({ batches, onAlertsChanged }: SensorsViewProps) {
  const [selectedBatchId, setSelectedBatchId] = useState(batches[1]?.id ?? batches[0]?.id ?? '');
  const [readings, setReadings] = useState<SensorReadingRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [thresholds, setThresholds] = useState<SpoilageWeightsConfig['thresholds'] | null>(null);
  const [loading, setLoading] = useState(false);

  // Telemetry ingestion form (simulating ESP32/Arduino MQ-135 + MQ-3 + DHT22 + MLX90640)
  const [deviceId, setDeviceId] = useState('ESP32-NODE-B4');
  const [temperatureC, setTemperatureC] = useState(14.6);
  const [humidityPct, setHumidityPct] = useState(89.0);
  const [ethylenePpm, setEthylenePpm] = useState(28.5);
  const [ammoniaPpm, setAmmoniaPpm] = useState(11.2);
  const [co2Ppm, setCo2Ppm] = useState(1450);
  const [thermalMaxC, setThermalMaxC] = useState(19.4);
  const [submitting, setSubmitting] = useState(false);
  const [ingestFeedback, setIngestFeedback] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const loadBatchTelemetry = async (batchId: string) => {
    if (!batchId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sensors/batch/${batchId}`);
      if (res.ok) {
        const data = await res.json();
        setReadings(data.readings ?? []);
        setAlerts(data.alerts ?? []);
        setThresholds(data.thresholds ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatchTelemetry(selectedBatchId);
  }, [selectedBatchId]);

  const applyPreset = (preset: 'nominal' | 'warning' | 'critical') => {
    if (preset === 'nominal') {
      setTemperatureC(3.6);
      setHumidityPct(90.5);
      setEthylenePpm(2.4);
      setAmmoniaPpm(0.5);
      setCo2Ppm(520);
      setThermalMaxC(5.1);
    } else if (preset === 'warning') {
      setTemperatureC(14.8);
      setHumidityPct(91.0);
      setEthylenePpm(27.5);
      setAmmoniaPpm(12.4);
      setCo2Ppm(1620);
      setThermalMaxC(19.8);
    } else {
      setTemperatureC(18.9);
      setHumidityPct(94.5);
      setEthylenePpm(42.0);
      setAmmoniaPpm(23.5);
      setCo2Ppm(2380);
      setThermalMaxC(25.2);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) return;
    setSubmitting(true);
    setIngestFeedback(null);
    try {
      const res = await fetch('/api/sensors/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          deviceId,
          temperatureC,
          humidityPct,
          ethylenePpm,
          ammoniaPpm,
          co2Ppm,
          thermalMaxC,
          thermalMinC: Number((temperatureC - 0.5).toFixed(1)),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const raisedCount = Array.isArray(data.alertsRaised) ? data.alertsRaised.length : 0;
        setIngestFeedback(
          raisedCount > 0
            ? `Reading persisted — ${raisedCount} threshold alert${raisedCount > 1 ? 's' : ''} triggered.`
            : 'Reading persisted — all telemetry values within configured thresholds.'
        );
        await loadBatchTelemetry(selectedBatchId);
        await onAlertsChanged();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAckAlert = async (alertId: string) => {
    const res = await fetch(`/api/alerts/${alertId}/ack`, { method: 'PATCH' });
    if (res.ok) {
      await loadBatchTelemetry(selectedBatchId);
      await onAlertsChanged();
    }
  };

  const latest = readings[readings.length - 1];
  const chartData = readings.map((r) => ({
    time: new Date(r.recordedAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    temperatureC: r.temperatureC,
    humidityPct: r.humidityPct,
    ethylenePpm: r.ethylenePpm,
    ammoniaPpm: r.ammoniaPpm,
    risk: r.computedSpoilageRisk,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Thermal &amp; Gas IoT Telemetry
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Monitor ESP32 MQ-135, MQ-3, DHT22, and MLX90640 infrared thermal streams per batch to detect invisible off-gassing before surface rot appears.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Monitored Batch
          </label>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-800"
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.storageLocation}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Latest Sensor Snapshot Row */}
      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {[
            {
              label: 'Temperature',
              val: `${latest.temperatureC} °C`,
              warn: thresholds ? latest.temperatureC > thresholds.maxTempC : false,
            },
            {
              label: 'Humidity',
              val: `${latest.humidityPct}%`,
              warn: thresholds ? latest.humidityPct > thresholds.maxHumidityPct : false,
            },
            {
              label: 'Ethylene (C₂H₄)',
              val: `${latest.ethylenePpm} ppm`,
              warn: thresholds ? latest.ethylenePpm > thresholds.maxEthylenePpm : false,
            },
            {
              label: 'Ammonia (NH₃)',
              val: `${latest.ammoniaPpm} ppm`,
              warn: thresholds ? latest.ammoniaPpm > thresholds.maxAmmoniaPpm : false,
            },
            {
              label: 'CO₂ Level',
              val: `${latest.co2Ppm} ppm`,
              warn: thresholds ? latest.co2Ppm > thresholds.maxCo2Ppm : false,
            },
            {
              label: 'Spoilage Risk',
              val: `${latest.computedSpoilageRisk}/100`,
              warn: latest.computedSpoilageRisk >= 60,
            },
          ].map((m) => (
            <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">{m.label}</div>
              <div
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  m.warn ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {m.val}
              </div>
              <div className="text-[11px] mt-1 text-slate-500">
                {m.warn ? 'Above threshold' : 'Nominal'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Split: Time-Series Chart + 8x8 MLX90640 Thermal Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Batch Spoilage &amp; Gas Trajectory
              </h2>
              <p className="text-xs text-slate-500">
                Time-series measurements ingested via POST /api/sensors/readings
              </p>
            </div>
            {loading && <span className="text-xs text-slate-400">Syncing...</span>}
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="ethylenePpm"
                  name="Ethylene (ppm)"
                  stroke="#D97706"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="ammoniaPpm"
                  name="Ammonia (ppm)"
                  stroke="#DC2626"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="temperatureC"
                  name="Temp (°C)"
                  stroke="#0F172A"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="risk"
                  name="Spoilage Risk"
                  stroke="#0D9488"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 8x8 MLX90640 IR Thermal Camera Matrix */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                MLX90640 Infrared Thermal Matrix
              </h2>
              <p className="text-xs text-slate-500">
                Downsampled 8×8 crate surface thermal map (respiration hotspots)
              </p>
            </div>
            {latest && (
              <span className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
                {latest.thermalMinC}°–{latest.thermalMaxC}°C
              </span>
            )}
          </div>

          {latest ? (
            <div className="space-y-3">
              <div className="grid grid-cols-8 gap-1 p-2 bg-slate-950 rounded-lg">
                {latest.thermalMatrix.flatMap((row, rIdx) =>
                  row.map((val, cIdx) => (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      title={`Row ${rIdx + 1}, Col ${cIdx + 1}: ${val} °C`}
                      style={{
                        backgroundColor: thermalCellColor(
                          val,
                          latest.thermalMinC,
                          latest.thermalMaxC
                        ),
                      }}
                      className="aspect-square rounded-[3px] flex items-center justify-center text-[10px] font-mono tabular-nums text-white/95 font-medium"
                    >
                      {val.toFixed(0)}
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span>Cool ({latest.thermalMinC} °C)</span>
                <div className="h-2 flex-1 mx-3 rounded-full bg-gradient-to-r from-blue-700 via-teal-600 via-amber-500 to-red-600" />
                <span>Hotspot ({latest.thermalMaxC} °C)</span>
              </div>
              <div className="text-xs text-slate-500 font-mono">
                Node: {latest.deviceId} · Updated {new Date(latest.recordedAt).toLocaleTimeString()}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              No thermal frames ingested for this batch yet.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Split: Simulate ESP32 Ingest + Active Threshold Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleIngest}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Ingest ESP32 / IoT Telemetry Packet
              </h2>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => applyPreset('nominal')}
                className="px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white rounded-md transition-colors"
              >
                Nominal
              </button>
              <button
                type="button"
                onClick={() => applyPreset('warning')}
                className="px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-white rounded-md transition-colors"
              >
                Warning
              </button>
              <button
                type="button"
                onClick={() => applyPreset('critical')}
                className="px-2 py-1 text-[11px] font-medium text-red-800 hover:bg-white rounded-md transition-colors"
              >
                Spoilage Spike
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Node ID</span>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Temp (°C)</span>
              <input
                type="number"
                step="0.1"
                value={temperatureC}
                onChange={(e) => setTemperatureC(Number(e.target.value))}
                className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Humidity (%)</span>
              <input
                type="number"
                step="0.5"
                value={humidityPct}
                onChange={(e) => setHumidityPct(Number(e.target.value))}
                className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Ethylene (ppm)</span>
              <input
                type="number"
                step="0.5"
                value={ethylenePpm}
                onChange={(e) => setEthylenePpm(Number(e.target.value))}
                className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Ammonia (ppm)</span>
              <input
                type="number"
                step="0.5"
                value={ammoniaPpm}
                onChange={(e) => setAmmoniaPpm(Number(e.target.value))}
                className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Thermal Peak (°C)</span>
              <input
                type="number"
                step="0.1"
                value={thermalMaxC}
                onChange={(e) => setThermalMaxC(Number(e.target.value))}
                className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
            </label>
          </div>

          {ingestFeedback && (
            <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              {ingestFeedback}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? 'Posting Telemetry...' : 'POST /api/sensors/readings'}
          </button>

          <div className="pt-3 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Live ESP32 REST Payload</span>
              <button
                type="button"
                onClick={async () => {
                  const cmd = `curl -X POST ${window.location.origin}/api/sensors/readings -H "Content-Type: application/json" -d '${JSON.stringify({
                    batchId: selectedBatchId,
                    deviceId,
                    temperatureC,
                    humidityPct,
                    ethylenePpm,
                    ammoniaPpm,
                    co2Ppm,
                    thermalMaxC,
                  })}'`;
                  await navigator.clipboard.writeText(cmd);
                  setCopiedCurl(true);
                  setTimeout(() => setCopiedCurl(false), 1800);
                }}
                className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900"
              >
                {copiedCurl ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                {copiedCurl ? 'Copied curl' : 'Copy curl'}
              </button>
            </div>
            <pre className="p-2.5 rounded-lg bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto">
              <code>{`POST /api/sensors/readings  {"batchId":"${selectedBatchId}","deviceId":"${deviceId}","temperatureC":${temperatureC},"humidityPct":${humidityPct},"ethylenePpm":${ethylenePpm},"ammoniaPpm":${ammoniaPpm},"co2Ppm":${co2Ppm},"thermalMaxC":${thermalMaxC}}`}</code>
            </pre>
          </div>
        </form>

        {/* Threshold Alerts Panel */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Threshold Breach Alerts</h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {alerts.filter((a) => !a.acknowledged).length} open
            </span>
          </div>

          {alerts.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No threshold alerts recorded for this batch.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {alerts.map((al) => (
                <div key={al.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertTriangle
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        al.acknowledged
                          ? 'text-slate-400'
                          : al.severity === 'CRITICAL'
                            ? 'text-red-600'
                            : 'text-amber-600'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">
                        <span
                          className={
                            al.acknowledged
                              ? 'text-slate-500'
                              : al.severity === 'CRITICAL'
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }
                        >
                          {al.severity}
                        </span>
                        <span className="text-slate-300 mx-1.5">·</span>
                        <span>{al.metric}</span>
                        <span className="text-slate-300 mx-1.5">·</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {al.measuredValue} / {al.thresholdValue}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{al.message}</p>
                    </div>
                  </div>
                  {!al.acknowledged ? (
                    <button
                      type="button"
                      onClick={() => handleAckAlert(al.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md shrink-0 whitespace-nowrap"
                    >
                      <Check className="w-3 h-3" />
                      Ack
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 shrink-0">Resolved</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
