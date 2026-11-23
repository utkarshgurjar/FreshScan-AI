import { useEffect, useState } from 'react';
import { Download, Lock, Plus, Save, ShieldCheck } from 'lucide-react';
import type {
  FeedbackRecord,
  ProduceTypeRecord,
  SpoilageWeightsConfig,
  UserProfile,
  UserRole,
} from '../types/freshscan';

interface AdminViewProps {
  authToken: string | null;
  currentUser: UserProfile | null;
  onAuthenticated: (payload: {
    accessToken: string;
    refreshToken: string;
    user: UserProfile;
  }) => void;
  onConfigUpdated: () => Promise<void>;
}

export function AdminView({
  authToken,
  currentUser,
  onAuthenticated,
  onConfigUpdated,
}: AdminViewProps) {
  const isAdmin = currentUser?.role === 'ADMIN' && Boolean(authToken);

  const [tab, setTab] = useState<'weights' | 'produce' | 'dataset' | 'users'>('weights');
  const [adminStatus, setAdminStatus] = useState<{
    envConfigured: boolean;
    claimed: boolean;
    adminConfigured: boolean;
  } | null>(null);
  const [passcode, setPasscode] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  // Admin resources
  const [config, setConfig] = useState<SpoilageWeightsConfig | null>(null);
  const [produceTypes, setProduceTypes] = useState<ProduceTypeRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [dataset, setDataset] = useState<FeedbackRecord[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New produce type form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<'Fruit' | 'Vegetable'>('Fruit');
  const [newTemp, setNewTemp] = useState('4–8 °C');
  const [newHum, setNewHum] = useState('85–90%');
  const [newShelfLife, setNewShelfLife] = useState(10);

  useEffect(() => {
    fetch('/api/auth/admin-status')
      .then((r) => r.json())
      .then(setAdminStatus)
      .catch(() => {});
  }, []);

  const loadAdminData = async () => {
    if (!authToken) return;
    const headers = { Authorization: `Bearer ${authToken}` };
    const [cfgRes, prodRes, usrRes, dsRes] = await Promise.all([
      fetch('/api/settings/spoilage'),
      fetch('/api/admin/produce-types', { headers }),
      fetch('/api/admin/users', { headers }),
      fetch('/api/admin/dataset', { headers }),
    ]);
    if (cfgRes.ok) setConfig(await cfgRes.json());
    if (prodRes.ok) setProduceTypes(await prodRes.json());
    if (usrRes.ok) setUsers(await usrRes.json());
    if (dsRes.ok) setDataset(await dsRes.json());
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, authToken]);

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimError(null);
    setClaiming(true);
    try {
      const res = await fetch('/api/auth/claim-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode,
          email: currentUser?.email ?? 'admin@freshscan.local',
          name: currentUser?.name ?? 'Lead QA Administrator',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClaimError(data.message || 'Invalid admin credentials.');
        return;
      }
      onAuthenticated(data);
      setPasscode('');
    } finally {
      setClaiming(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || !authToken) return;
    setStatusMsg(null);
    setErrorMsg(null);
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.message || 'Failed to save settings.');
      return;
    }
    setConfig(data);
    setStatusMsg('Spoilage fusion weights and sensor alert thresholds updated.');
    await onConfigUpdated();
  };

  const handleAddProduce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !newName.trim()) return;
    const res = await fetch('/api/admin/produce-types', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: newName,
        category: newCategory,
        optimalTempC: newTemp,
        optimalHumidityPct: newHum,
        baselineShelfLifeDays: newShelfLife,
        ethyleneSensitivity: 'Medium',
      }),
    });
    if (res.ok) {
      setNewName('');
      await loadAdminData();
      await onConfigUpdated();
    }
  };

  const handleChangeRole = async (userId: string, role: UserRole) => {
    if (!authToken) return;
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      await loadAdminData();
    }
  };

  const handleDownloadDataset = async (format: 'csv' | 'json') => {
    if (!authToken) return;
    const res = await fetch(`/api/admin/dataset/export?format=${format}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freshscan-retraining-dataset.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                {adminStatus?.adminConfigured
                  ? 'Administrator Verification Required'
                  : 'First-Run Administrator Setup'}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {adminStatus?.envConfigured
                  ? 'Enter the server ADMIN_PASSCODE secret to manage produce taxonomy, spoilage fusion weights, user roles, and retraining exports.'
                  : adminStatus?.claimed
                    ? 'Enter your established administrator password to unlock the Admin console.'
                    : 'No admin password is configured yet. Create a first-run administrator password below to lock and unlock the Admin console.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleClaimAdmin} className="space-y-3.5">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">
                {adminStatus?.adminConfigured ? 'Administrator Password' : 'New Administrator Password'}
              </span>
              <input
                type="password"
                required
                minLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </label>
            {claimError && (
              <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {claimError}
              </div>
            )}
            <button
              type="submit"
              disabled={claiming}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {claiming
                ? 'Verifying...'
                : adminStatus?.adminConfigured
                  ? 'Unlock Admin Console'
                  : 'Initialize & Unlock Admin'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const weightSum = config
    ? Number(
        (
          config.visualWeight +
          config.ethyleneWeight +
          config.ammoniaWeight +
          config.temperatureWeight +
          config.humidityWeight
        ).toFixed(2)
      )
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin Console &amp; Retraining Dataset
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Configure weighted spoilage fusion coefficients, manage produce grading taxonomy, assign RBAC roles, and export inspector feedback datasets.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'weights', label: 'Spoilage Weights' },
            { id: 'produce', label: 'Produce Types' },
            { id: 'dataset', label: `Dataset (${dataset.length})` },
            { id: 'users', label: `Users (${users.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Spoilage Index Weights & Alert Thresholds */}
      {tab === 'weights' && config && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Weighted Spoilage Index Formula
                </h2>
                <p className="text-xs text-slate-500">
                  Weights must sum to 1.00 (100%). Current sum:{' '}
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      Math.abs(weightSum - 1) <= 0.02 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {weightSum.toFixed(2)}
                  </span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              {[
                { key: 'visualWeight', label: 'Visual Vision AI' },
                { key: 'ethyleneWeight', label: 'Ethylene (C₂H₄)' },
                { key: 'ammoniaWeight', label: 'Ammonia (NH₃)' },
                { key: 'temperatureWeight', label: 'Temperature' },
                { key: 'humidityWeight', label: 'Humidity' },
              ].map((w) => (
                <label key={w.key} className="block space-y-1">
                  <span className="text-xs font-medium text-slate-700">{w.label}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={config[w.key as keyof Omit<SpoilageWeightsConfig, 'thresholds'>]}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        [w.key]: Number(e.target.value),
                      })
                    }
                    className="w-full h-9 px-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              IoT Sensor Alert Thresholds
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              {[
                { key: 'maxTempC', label: 'Max Temp (°C)' },
                { key: 'maxHumidityPct', label: 'Max Humidity (%)' },
                { key: 'maxEthylenePpm', label: 'Max Ethylene (ppm)' },
                { key: 'maxAmmoniaPpm', label: 'Max Ammonia (ppm)' },
                { key: 'maxCo2Ppm', label: 'Max CO₂ (ppm)' },
                { key: 'maxThermalSpotC', label: 'Max Hotspot (°C)' },
              ].map((th) => (
                <label key={th.key} className="block space-y-1">
                  <span className="text-xs font-medium text-slate-700">{th.label}</span>
                  <input
                    type="number"
                    step="0.5"
                    value={
                      config.thresholds[
                        th.key as keyof SpoilageWeightsConfig['thresholds']
                      ]
                    }
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        thresholds: {
                          ...config.thresholds,
                          [th.key]: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full h-9 px-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
                  />
                </label>
              ))}
            </div>
          </div>

          {statusMsg && (
            <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save Formula &amp; Thresholds
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Produce Types Taxonomy */}
      {tab === 'produce' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddProduce}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-end gap-3"
          >
            <label className="flex-1 min-w-[160px] space-y-1">
              <span className="text-xs font-medium text-slate-700">New Produce Name</span>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Papaya"
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg"
              />
            </label>
            <label className="w-32 space-y-1">
              <span className="text-xs font-medium text-slate-700">Category</span>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as 'Fruit' | 'Vegetable')}
                className="w-full h-9 px-2.5 text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value="Fruit">Fruit</option>
                <option value="Vegetable">Vegetable</option>
              </select>
            </label>
            <label className="w-28 space-y-1">
              <span className="text-xs font-medium text-slate-700">Optimal Temp</span>
              <input
                type="text"
                value={newTemp}
                onChange={(e) => setNewTemp(e.target.value)}
                className="w-full h-9 px-2.5 text-sm bg-white border border-slate-200 rounded-lg"
              />
            </label>
            <label className="w-28 space-y-1">
              <span className="text-xs font-medium text-slate-700">Humidity</span>
              <input
                type="text"
                value={newHum}
                onChange={(e) => setNewHum(e.target.value)}
                className="w-full h-9 px-2.5 text-sm bg-white border border-slate-200 rounded-lg"
              />
            </label>
            <label className="w-28 space-y-1">
              <span className="text-xs font-medium text-slate-700">Shelf Life (d)</span>
              <input
                type="number"
                min="1"
                value={newShelfLife}
                onChange={(e) => setNewShelfLife(Number(e.target.value))}
                className="w-full h-9 px-2.5 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
              />
            </label>
            <button
              type="submit"
              className="h-9 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Class
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Produce Class</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Optimal Storage</th>
                  <th className="py-3 px-4">Ethylene Sensitivity</th>
                  <th className="py-3 px-4 text-right">Baseline Shelf Life</th>
                  <th className="py-3 px-4 text-right">Grade Cutoffs (A/B/C)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {produceTypes.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-semibold text-slate-900">{p.name}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{p.category}</td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-700">
                      {p.optimalTempC} · {p.optimalHumidityPct}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{p.ethyleneSensitivity}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                      {p.baselineShelfLifeDays} days
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                      {p.gradeAMinScore} / {p.gradeBMinScore} / {p.gradeCMinScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Feedback Retraining Dataset Export */}
      {tab === 'dataset' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Verified &amp; Corrected Feedback Retraining Table
              </h2>
              <p className="text-xs text-slate-500">
                Export labeled ground-truth corrections for Python MobileNetV2 fine-tuning and ONNX re-export.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadDataset('csv')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => handleDownloadDataset('json')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Scan ID</th>
                  <th className="py-3 px-4">Verdict</th>
                  <th className="py-3 px-4">Predicted</th>
                  <th className="py-3 px-4">Ground Truth</th>
                  <th className="py-3 px-4">Inspector Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {dataset.map((f) => (
                  <tr key={f.id}>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700">{f.scanId}</td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      <span className={f.isCorrect ? 'text-emerald-700' : 'text-amber-700'}>
                        {f.isCorrect ? 'Verified Correct' : 'Corrected Label'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {f.predictedItem} · {f.predictedFreshness}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-900">
                      {f.correctedItem} · {f.correctedFreshness}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{f.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Users & RBAC */}
      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Joined</th>
                <th className="py-3 px-4 text-right">Assigned Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 px-4 font-semibold text-slate-900">{u.name}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-600">{u.email}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <select
                      value={u.role}
                      onChange={(e) => handleChangeRole(u.id, e.target.value as UserRole)}
                      className="h-8 px-2.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="INSPECTOR">INSPECTOR</option>
                      <option value="USER">USER</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
