import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, Search, Terminal } from 'lucide-react';
import { BLUEPRINT_PART_1, type BlueprintFile } from '../data/springBootBlueprintPart1';
import { BLUEPRINT_PART_2 } from '../data/springBootBlueprintPart2';
import { BLUEPRINT_PART_3 } from '../data/springBootBlueprintPart3';
import { BLUEPRINT_PART_4 } from '../data/springBootBlueprintPart4';
import { BLUEPRINT_PART_5 } from '../data/springBootBlueprintPart5';
import { downloadFromApi } from '../utils/downloadFile';

const ALL_FILES: BlueprintFile[] = [
  ...BLUEPRINT_PART_1,
  ...BLUEPRINT_PART_2,
  ...BLUEPRINT_PART_3,
  ...BLUEPRINT_PART_4,
  ...BLUEPRINT_PART_5,
].sort((a, b) => a.sectionOrder - b.sectionOrder);

const ER_TABLES = [
  { name: 'roles', cols: 'id (PK), name (UQ), created_at' },
  { name: 'users', cols: 'id (PK), full_name, email (UQ), password_hash, role_id (FK -> roles), active, timestamps' },
  { name: 'produce_types', cols: 'id (PK), name (UQ), category, optimal_temp, optimal_humidity, baseline_shelf_life_days, grade cutoffs' },
  { name: 'batches', cols: 'id (PK), batch_code (UQ), supplier, produce_category, received_date, storage_location, created_by (FK -> users)' },
  { name: 'scans', cols: 'id (PK), batch_id (FK), user_id (FK), produce_type_id (FK), freshness_class, quality_grade, visual_score, quality_score, spoilage_index, confidence, shelf_life_days, image_storage_key' },
  { name: 'scan_defects', cols: 'id (PK), scan_id (FK -> scans), defect_type, severity, confidence, bbox_ymin/xmin/ymax/xmax' },
  { name: 'sensor_readings', cols: 'id (PK), batch_id (FK -> batches), device_id, temperature_c, humidity_pct, ethylene_ppm, ammonia_ppm, co2_ppm, thermal_matrix_json, computed_spoilage_risk' },
  { name: 'feedback', cols: 'id (PK), scan_id (FK, UQ), user_id (FK), is_correct, predicted_*, corrected_*, exported_for_training' },
  { name: 'alerts', cols: 'id (PK), batch_id (FK -> batches), sensor_reading_id (FK), severity, metric_name, measured_value, threshold_value, acknowledged' },
];

const ROADMAP = [
  {
    phase: 'Phase 1 · Edge & Mobile Deployment',
    detail: 'Quantize MobileNetV2 ONNX to INT8 for TensorFlow Lite / ONNX Mobile on iOS & Android offline warehouse scanners with camera torch auto-metering.',
  },
  {
    phase: 'Phase 2 · Hyperspectral & Near-Infrared Fusion',
    detail: 'Integrate NIR spectrometer readings (700–1100 nm) to estimate internal Brix sugar levels and subsurface chilling injury before epidermal darkening.',
  },
  {
    phase: 'Phase 3 · Expanded Produce Taxonomy & Localization',
    detail: 'Scale from 12 core classes to 60+ regional cultivars with active-learning retraining jobs triggered automatically once 250 inspector feedback samples accumulate, plus i18n (EN/ES/HI/FR).',
  },
];

export function BlueprintView() {
  const [selectedId, setSelectedId] = useState<string>(ALL_FILES[0].id);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_FILES;
    return ALL_FILES.filter(
      (f) =>
        f.path.toLowerCase().includes(q) ||
        f.section.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q)
    );
  }, [query]);

  const selectedFile = useMemo(
    () => filteredFiles.find((f) => f.id === selectedId) ?? filteredFiles[0] ?? ALL_FILES[0],
    [filteredFiles, selectedId]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadFile = (file: BlueprintFile) => {
    const blob = new Blob([file.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFullScaffoldScript = () => {
    const lines: string[] = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "Scaffolding complete FreshScan AI Java Spring Boot 3.x + Python ML + Docker + ESP32 repository..."',
      '',
    ];
    for (const file of ALL_FILES) {
      const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '.';
      lines.push(`mkdir -p "${dir}"`);
      lines.push(`cat << 'FRESHSCAN_EOF' > "${file.path}"`);
      lines.push(file.code);
      lines.push('FRESHSCAN_EOF');
      lines.push('');
    }
    lines.push('echo "Scaffolded ' + ALL_FILES.length + ' files. Next: cd freshscan-backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev"');

    const blob = new Blob([lines.join('\n')], { type: 'text/x-shellscript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'freshscan-ai-scaffold.sh';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Java Spring Boot 3.x Production Blueprint
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Complete reference repository ({ALL_FILES.length} files): Maven, Flyway SQL, Entities &amp; Repositories, JWT Security + Bucket4j, JavaCV OpenCV, ONNX Runtime &amp; FastAPI Option B, MapStruct, OpenPDF, Python MobileNetV2, Docker, Testcontainers, and ESP32 firmware.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              downloadFromApi('/api/docs/openapi.json', 'freshscan-openapi-3.0.json').catch(() => {})
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            OpenAPI 3.0 JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadFullScaffoldScript}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Download Full Scaffold ({ALL_FILES.length} Files)
          </button>
        </div>
      </div>

      {/* System Architecture Diagram */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">System Architecture Diagram</h2>
        <div className="overflow-x-auto">
          <svg
            viewBox="0 0 980 225"
            className="w-full min-w-[760px] h-auto"
            role="img"
            aria-label="FreshScan AI Spring Boot, ONNX, OpenCV, MySQL, and ESP32 Architecture Diagram"
          >
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748B" />
              </marker>
            </defs>

            <rect x="12" y="24" width="180" height="72" rx="8" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <text x="102" y="52" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0F172A">React Web / Mobile</text>
            <text x="102" y="70" textAnchor="middle" fontSize="10" fill="#475569">getUserMedia Webcam</text>
            <text x="102" y="84" textAnchor="middle" fontSize="10" fill="#475569">Multi-Angle Upload UI</text>

            <rect x="12" y="132" width="180" height="72" rx="8" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <text x="102" y="160" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0F172A">ESP32 IoT Edge Node</text>
            <text x="102" y="178" textAnchor="middle" fontSize="10" fill="#475569">MQ-135 · MQ-3 · DHT22</text>
            <text x="102" y="192" textAnchor="middle" fontSize="10" fill="#475569">MLX90640 IR Thermal</text>

            <rect x="242" y="16" width="230" height="192" rx="10" fill="#ECFDF5" stroke="#15803D" strokeWidth="1.5" />
            <text x="357" y="42" textAnchor="middle" fontSize="13" fontWeight="700" fill="#14532D">Spring Boot 3.3 (Java 21)</text>
            <text x="357" y="62" textAnchor="middle" fontSize="10" fill="#166534">JWT Security · Bucket4j · Swagger</text>
            <rect x="260" y="76" width="194" height="34" rx="6" fill="#FFFFFF" stroke="#BBF7D0" />
            <text x="357" y="97" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#0F172A">OpenCV / JavaCV Validator</text>
            <rect x="260" y="118" width="194" height="34" rx="6" fill="#FFFFFF" stroke="#BBF7D0" />
            <text x="357" y="139" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#0F172A">Weighted Spoilage Fusion</text>
            <rect x="260" y="160" width="194" height="34" rx="6" fill="#FFFFFF" stroke="#BBF7D0" />
            <text x="357" y="181" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#0F172A">OpenPDF &amp; CSV Reports</text>

            <rect x="524" y="24" width="204" height="80" rx="8" fill="#F8FAFC" stroke="#0F172A" strokeWidth="1.5" />
            <text x="626" y="48" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0F172A">AI Inference Engine</text>
            <text x="626" y="66" textAnchor="middle" fontSize="10" fill="#475569">Option A: ONNX Runtime Java</text>
            <text x="626" y="80" textAnchor="middle" fontSize="10" fill="#475569">Option B: FastAPI WebClient</text>
            <text x="626" y="94" textAnchor="middle" fontSize="10" fill="#475569">Fallback: OpenCV HSV Rules</text>

            <rect x="524" y="128" width="204" height="76" rx="8" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <text x="626" y="154" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0F172A">MySQL 8 + Flyway</text>
            <text x="626" y="172" textAnchor="middle" fontSize="10" fill="#475569">9 Normalized Tables</text>
            <text x="626" y="186" textAnchor="middle" fontSize="10" fill="#475569">Scans · Batches · Sensors · Alerts</text>

            <rect x="776" y="24" width="192" height="80" rx="8" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <text x="872" y="50" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0F172A">Python ML Pipeline</text>
            <text x="872" y="68" textAnchor="middle" fontSize="10" fill="#475569">MobileNetV2 Transfer</text>
            <text x="872" y="84" textAnchor="middle" fontSize="10" fill="#475569">Feedback Loop → ONNX</text>

            <rect x="776" y="128" width="192" height="76" rx="8" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <text x="872" y="154" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0F172A">Pluggable Storage</text>
            <text x="872" y="172" textAnchor="middle" fontSize="10" fill="#475569">Local FS (Path-Confined)</text>
            <text x="872" y="186" textAnchor="middle" fontSize="10" fill="#475569">S3 / Cloudinary Interface</text>

            <line x1="192" y1="60" x2="240" y2="60" stroke="#64748B" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <line x1="192" y1="168" x2="240" y2="168" stroke="#64748B" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <line x1="472" y1="64" x2="522" y2="64" stroke="#64748B" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <line x1="472" y1="166" x2="522" y2="166" stroke="#64748B" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <line x1="776" y1="64" x2="730" y2="64" stroke="#64748B" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrow)" />
            <line x1="728" y1="166" x2="774" y2="166" stroke="#64748B" strokeWidth="1.5" markerEnd="url(#arrow)" />
          </svg>
        </div>
      </div>

      {/* Code Browser Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-500">
              Deliverable Files ({filteredFiles.length}/{ALL_FILES.length})
            </span>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter Java, SQL, Python, Docker..."
              className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-700"
            />
          </div>
          <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
            {filteredFiles.map((file) => {
              const active = file.id === selectedFile.id;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setSelectedId(file.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2.5 ${
                    active
                      ? 'bg-emerald-50 text-emerald-950'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FileCode2
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      active ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{file.section}</div>
                    <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                      {file.path}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-mono font-semibold text-slate-900 truncate">
                {selectedFile.path}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{selectedFile.summary}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadFile(selectedFile)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Save File
              </button>
            </div>
          </div>

          <div className="bg-slate-950 text-slate-100 p-4 overflow-x-auto max-h-[540px] overflow-y-auto">
            <pre className="text-xs font-mono leading-relaxed whitespace-pre">
              <code>{selectedFile.code}</code>
            </pre>
          </div>

          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center gap-2.5 text-xs">
            <Terminal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-500 shrink-0">Run &amp; Verify:</span>
            <code className="font-mono text-slate-800 truncate">{selectedFile.runCommand}</code>
          </div>
        </div>
      </div>

      {/* 9-Table Relational Schema & Future Roadmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Relational Database Schema (9 Flyway Tables)
          </h2>
          <div className="divide-y divide-slate-100">
            {ER_TABLES.map((t) => (
              <div key={t.name} className="py-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 text-xs">
                <span className="font-mono font-semibold text-emerald-800 w-36 shrink-0">
                  {t.name}
                </span>
                <span className="font-mono text-slate-600">{t.cols}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            Future Improvements Roadmap
          </h2>
          <div className="divide-y divide-slate-100">
            {ROADMAP.map((item) => (
              <div key={item.phase} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="text-sm font-semibold text-slate-900">{item.phase}</div>
                <p className="text-xs text-slate-600 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
