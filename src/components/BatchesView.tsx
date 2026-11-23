import { useMemo, useState } from 'react';
import { Download, Eye, FileSpreadsheet, FileText, Plus, Search, Trash2, X } from 'lucide-react';
import type { BatchSummary, QualityGrade, ScanRecord, UserProfile } from '../types/freshscan';
import { downloadFromApi } from '../utils/downloadFile';
import { DefectOverlayViewer } from './DefectOverlayViewer';

interface BatchesViewProps {
  batches: BatchSummary[];
  scans: ScanRecord[];
  authToken: string | null;
  currentUser: UserProfile | null;
  onRefresh: () => Promise<void>;
}

export function BatchesView({
  batches,
  scans,
  authToken,
  currentUser,
  onRefresh,
}: BatchesViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [produceCategory, setProduceCategory] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [storageLocation, setStorageLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // History filters
  const [search, setSearch] = useState('');
  const [filterBatch, setFilterBatch] = useState('ALL');
  const [filterGrade, setFilterGrade] = useState<'ALL' | QualityGrade>('ALL');
  const [filterItem, setFilterItem] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ownOnly, setOwnOnly] = useState(false);
  const [selectedScan, setSelectedScan] = useState<ScanRecord | null>(null);

  const uniqueItems = useMemo(
    () => Array.from(new Set(scans.map((s) => s.itemType))).sort(),
    [scans]
  );

  const filteredScans = useMemo(() => {
    return scans.filter((s) => {
      if (filterBatch !== 'ALL' && s.batchId !== filterBatch) return false;
      if (filterGrade !== 'ALL' && s.qualityGrade !== filterGrade) return false;
      if (filterItem !== 'ALL' && s.itemType !== filterItem) return false;
      if (ownOnly && currentUser && s.userId !== currentUser.id) return false;
      const scanDay = s.createdAt.slice(0, 10);
      if (fromDate && scanDay < fromDate) return false;
      if (toDate && scanDay > toDate) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          s.itemType.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.freshnessClass.toLowerCase().includes(q) ||
          s.summaryNotes.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [scans, filterBatch, filterGrade, filterItem, ownOnly, currentUser, fromDate, toDate, search]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSavingBatch(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const res = await fetch('/api/batches', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          supplier,
          produceCategory,
          receivedDate,
          storageLocation,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || 'Could not create batch.');
        return;
      }
      setSupplier('');
      setProduceCategory('');
      setStorageLocation('');
      setNotes('');
      setShowCreate(false);
      await onRefresh();
    } finally {
      setSavingBatch(false);
    }
  };

  const handleDeleteScan = async (scanId: string) => {
    if (!authToken) return;
    const res = await fetch(`/api/scans/${scanId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      if (selectedScan?.id === scanId) setSelectedScan(null);
      await onRefresh();
    }
  };

  const batchCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    batches.forEach((b) => map.set(b.id, b.code));
    return map;
  }, [batches]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Batch Inventory &amp; Scan History
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Group incoming warehouse deliveries into tracked lots, review freshness composition, and export PDF or CSV audit reports.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          New Batch Lot
        </button>
      </div>

      {/* Create Batch Form */}
      {showCreate && (
        <form
          onSubmit={handleCreateBatch}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Register Incoming Produce Lot</h2>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Supplier Name</span>
              <input
                type="text"
                required
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Yakima Cold Growers"
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Produce Category</span>
              <input
                type="text"
                value={produceCategory}
                onChange={(e) => setProduceCategory(e.target.value)}
                placeholder="Stone Fruit / Apples"
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Received Date</span>
              <input
                type="date"
                required
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg font-mono tabular-nums"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Storage Chamber</span>
              <input
                type="text"
                required
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="Cold Chamber C1 (4.0 °C)"
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </label>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery notes, container seal number, or pre-cooling remarks..."
            className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
          />
          {formError && <p className="text-xs text-red-700">{formError}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingBatch}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              {savingBatch ? 'Saving Lot...' : 'Create Batch'}
            </button>
          </div>
        </form>
      )}

      {/* Batch Summary Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Active Storage Batches</h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {batches.length} lots tracked
          </span>
        </div>
        {/* Mobile Card List (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {batches.map((b) => (
            <div key={b.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{b.code}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {b.supplier} · {b.receivedDate}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {b.storageLocation} · {b.produceCategory}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                    {b.averageScore}/100
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {b.totalScans} scans
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-700 font-medium">Fresh {b.freshPct}%</span>
                  <span className={b.rottenPct > 0 ? 'text-red-700 font-medium' : 'text-slate-500'}>
                    Rotten {b.rottenPct}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadFromApi(
                        `/api/batches/${b.id}/report?format=pdf`,
                        `${b.code}-report.pdf`,
                        authToken
                      ).catch((err) => setFormError(err instanceof Error ? err.message : 'PDF export failed'))
                    }
                    className="min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 active:bg-slate-200 rounded-lg"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadFromApi(
                        `/api/batches/${b.id}/report?format=csv`,
                        `${b.code}-report.csv`,
                        authToken
                      ).catch((err) => setFormError(err instanceof Error ? err.message : 'CSV export failed'))
                    }
                    className="min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 active:bg-slate-200 rounded-lg"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    CSV
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Lot Code &amp; Supplier</th>
                <th className="py-3 px-4">Storage Location</th>
                <th className="py-3 px-4 text-right">Scans</th>
                <th className="py-3 px-4 text-right">% Fresh</th>
                <th className="py-3 px-4 text-right">% Rotten</th>
                <th className="py-3 px-4 text-right">Avg Score</th>
                <th className="py-3 px-4 text-right">Export Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900">{b.code}</div>
                    <div className="text-xs text-slate-500">
                      {b.supplier} · {b.receivedDate}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-700">
                    <div>{b.storageLocation}</div>
                    <div className="text-slate-400">{b.produceCategory}</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                    {b.totalScans}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                    {b.freshPct}%
                  </td>
                  <td
                    className={`py-3.5 px-4 text-right font-mono tabular-nums font-medium ${
                      b.rottenPct > 0 ? 'text-red-700' : 'text-slate-500'
                    }`}
                  >
                    {b.rottenPct}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {b.averageScore}/100
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          downloadFromApi(
                            `/api/batches/${b.id}/report?format=pdf`,
                            `${b.code}-report.pdf`,
                            authToken
                          ).catch((err) => setFormError(err instanceof Error ? err.message : 'PDF export failed'))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadFromApi(
                            `/api/batches/${b.id}/report?format=csv`,
                            `${b.code}-report.csv`,
                            authToken
                          ).catch((err) => setFormError(err instanceof Error ? err.message : 'CSV export failed'))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Searchable Scan History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Inspection History</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item, ID, notes..."
                className="h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700 w-48"
              />
            </div>
            <select
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
              className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="ALL">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </select>
            <select
              value={filterItem}
              onChange={(e) => setFilterItem(e.target.value)}
              className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="ALL">All Produce</option>
              {uniqueItems.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value as 'ALL' | QualityGrade)}
              className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="ALL">All Grades</option>
              <option value="A">Grade A</option>
              <option value="B">Grade B</option>
              <option value="C">Grade C</option>
              <option value="Reject">Reject</option>
            </select>
            <input
              type="date"
              aria-label="Filter from date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            />
            <input
              type="date"
              aria-label="Filter to date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            />
            {currentUser && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setOwnOnly(false)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    !ownOnly ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  All Scans
                </button>
                <button
                  type="button"
                  onClick={() => setOwnOnly(true)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    ownOnly ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  My History
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Scan History Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredScans.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-slate-500">
              No inspection records match your active filters.
            </div>
          ) : (
            filteredScans.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedScan(s)}
                className="p-4 flex items-center gap-3 active:bg-slate-50 transition-colors cursor-pointer"
              >
                <img
                  src={s.imageUrl}
                  alt={s.itemType}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900 truncate">{s.itemType}</span>
                    <span className="font-mono tabular-nums text-sm font-bold text-slate-900 shrink-0">
                      {s.qualityScore}/100
                    </span>
                  </div>
                  <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`font-semibold ${
                        s.qualityGrade === 'A'
                          ? 'text-emerald-700'
                          : s.qualityGrade === 'B'
                            ? 'text-teal-700'
                            : s.qualityGrade === 'C'
                              ? 'text-amber-700'
                              : 'text-red-700'
                      }`}
                    >
                      Grade {s.qualityGrade} · {s.freshnessClass}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {s.estimatedShelfLifeDays}d shelf life
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 truncate">
                    {s.storageRecommendation} · {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Scan History Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4">Batch</th>
                <th className="py-3 px-4">Freshness &amp; Grade</th>
                <th className="py-3 px-4 text-right">Score</th>
                <th className="py-3 px-4 text-right">Shelf Life</th>
                <th className="py-3 px-4">Storage</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredScans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No inspection records match your active filters.
                  </td>
                </tr>
              ) : (
                filteredScans.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={s.imageUrl}
                          alt={s.itemType}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">{s.itemType}</div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums">
                            {s.id} · {new Date(s.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-600">
                      {s.batchId ? batchCodeMap.get(s.batchId) ?? s.batchId : 'Standalone'}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={`font-semibold ${
                          s.qualityGrade === 'A'
                            ? 'text-emerald-700'
                            : s.qualityGrade === 'B'
                              ? 'text-teal-700'
                              : s.qualityGrade === 'C'
                                ? 'text-amber-700'
                                : 'text-red-700'
                        }`}
                      >
                        Grade {s.qualityGrade} · {s.freshnessClass}
                      </span>
                      <div className="text-slate-500 mt-0.5">
                        {s.defects.length} defects · {s.usedSensorFusion ? 'Sensor fused' : 'Vision'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {s.qualityScore}/100
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {s.estimatedShelfLifeDays}d
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{s.storageRecommendation}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedScan(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Inspect
                        </button>
                        {currentUser &&
                          (currentUser.role === 'ADMIN' ||
                            currentUser.role === 'INSPECTOR' ||
                            currentUser.id === s.userId) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteScan(s.id)}
                              aria-label={`Delete scan ${s.id}`}
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scan Detail Modal (Bottom Sheet on Mobile, Centered Dialog on Desktop) */}
      {selectedScan && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedScan(null)}
        >
          <div
            className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto bg-white border-t sm:border border-slate-200 rounded-t-3xl sm:rounded-xl shadow-xl p-5 sm:p-6 pb-safe space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1 sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-slate-500">
                  {selectedScan.id} · Inspected by {selectedScan.inspectorName}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                  {selectedScan.itemType} — Grade {selectedScan.qualityGrade} (
                  {selectedScan.qualityScore}/100)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedScan(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <DefectOverlayViewer
              imageUrl={selectedScan.imageUrl}
              angleImageUrls={selectedScan.angleImageUrls}
              itemType={selectedScan.itemType}
              defects={selectedScan.defects}
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3.5 border-y border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 block">Freshness</span>
                <span className="font-semibold text-slate-900 text-sm">
                  {selectedScan.freshnessClass}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Shelf Life</span>
                <span className="font-semibold font-mono tabular-nums text-slate-900 text-sm">
                  {selectedScan.estimatedShelfLifeDays} days
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Storage</span>
                <span className="font-semibold text-slate-900 text-sm">
                  {selectedScan.storageRecommendation}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Spoilage Index</span>
                <span className="font-semibold font-mono tabular-nums text-slate-900 text-sm">
                  {selectedScan.spoilageIndex}%
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">{selectedScan.summaryNotes}</p>

            <div className="flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() =>
                  downloadFromApi(
                    `/api/scans/${selectedScan.id}/report?format=csv`,
                    `${selectedScan.id}-report.csv`,
                    authToken
                  ).catch((err) => setFormError(err instanceof Error ? err.message : 'CSV export failed'))
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Scan CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFromApi(
                    `/api/scans/${selectedScan.id}/report?format=pdf`,
                    `${selectedScan.id}-certificate.pdf`,
                    authToken
                  ).catch((err) => setFormError(err instanceof Error ? err.message : 'PDF export failed'))
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                Scan Certificate (PDF)
              </button>
              {selectedScan.batchId && (
                <button
                  type="button"
                  onClick={() =>
                    downloadFromApi(
                      `/api/batches/${selectedScan.batchId}/report?format=pdf`,
                      `${selectedScan.batchId}-report.pdf`,
                      authToken
                    ).catch((err) => setFormError(err instanceof Error ? err.message : 'Batch PDF export failed'))
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  Batch Audit PDF
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
