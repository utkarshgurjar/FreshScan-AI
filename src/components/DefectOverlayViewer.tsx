import { useState } from 'react';
import { Eye, Layers, Target } from 'lucide-react';
import type { DefectBox } from '../types/freshscan';

interface DefectOverlayViewerProps {
  imageUrl: string;
  angleImageUrls?: string[];
  itemType: string;
  defects: DefectBox[];
}

export function DefectOverlayViewer({
  imageUrl,
  angleImageUrls = [],
  itemType,
  defects,
}: DefectOverlayViewerProps) {
  const [activeUrl, setActiveUrl] = useState(imageUrl);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const angles = angleImageUrls.length > 0 ? angleImageUrls : [imageUrl];
  const currentUrl = angles.includes(activeUrl) ? activeUrl : imageUrl;
  const isPrimaryAngle = currentUrl === angles[0];

  const severityStroke = (severity: DefectBox['severity']) => {
    if (severity === 'Severe') return '#DC2626';
    if (severity === 'Moderate') return '#D97706';
    return '#2563EB';
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">
          Optical Inspection Frame · {defects.length} localized{' '}
          {defects.length === 1 ? 'defect' : 'defects'}
        </span>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setShowBoxes((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              showBoxes
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            Bounding Boxes
          </button>
          <button
            type="button"
            onClick={() => setShowHeatmap((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              showHeatmap
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Defect Heatmap
          </button>
        </div>
      </div>

      <div className="relative w-full aspect-[4/3] bg-slate-900 rounded-lg overflow-hidden border border-slate-200">
        {!imgFailed ? (
          <img
            src={currentUrl}
            alt={`Inspected ${itemType}`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-500 gap-2">
            <Eye className="w-6 h-6 text-slate-400" />
            <span className="text-sm font-medium">{itemType} Optical Frame</span>
          </div>
        )}

        {/* Grad-CAM style attention heatmap overlay centered on defect regions */}
        {showHeatmap && isPrimaryAngle && defects.length > 0 && (
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen"
          >
            <defs>
              <radialGradient id="defectHeatSevere" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#EF4444" stopOpacity="0.88" />
                <stop offset="45%" stopColor="#F59E0B" stopOpacity="0.52" />
                <stop offset="78%" stopColor="#22C55E" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="defectHeatModerate" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.82" />
                <stop offset="55%" stopColor="#EAB308" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
              </radialGradient>
            </defs>
            {defects.map((d) => {
              const [ymin, xmin, ymax, xmax] = d.bbox;
              const cx = (xmin + xmax) / 2;
              const cy = (ymin + ymax) / 2;
              const rx = Math.max(70, (xmax - xmin) * 0.75);
              const ry = Math.max(70, (ymax - ymin) * 0.75);
              return (
                <ellipse
                  key={`hm-${d.id}`}
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={ry}
                  fill={d.severity === 'Severe' ? 'url(#defectHeatSevere)' : 'url(#defectHeatModerate)'}
                />
              );
            })}
          </svg>
        )}

        {/* Crisp Defect Bounding Boxes */}
        {showBoxes && isPrimaryAngle && defects.length > 0 && (
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {defects.map((d) => {
              const [ymin, xmin, ymax, xmax] = d.bbox;
              const stroke = severityStroke(d.severity);
              const labelY = Math.max(28, ymin - 8);
              return (
                <g key={d.id}>
                  <rect
                    x={xmin}
                    y={ymin}
                    width={Math.max(18, xmax - xmin)}
                    height={Math.max(18, ymax - ymin)}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="6"
                    strokeDasharray="14 6"
                  />
                  <rect
                    x={xmin}
                    y={labelY - 26}
                    width={Math.min(340, Math.max(185, d.type.length * 16 + 90))}
                    height={30}
                    fill={stroke}
                    rx="4"
                  />
                  <text
                    x={xmin + 10}
                    y={labelY - 6}
                    fill="#FFFFFF"
                    fontSize="20"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {d.type.replace('_', ' ')} ({d.confidence}%)
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {isPrimaryAngle && defects.length === 0 && (
          <div className="absolute bottom-3 left-3 right-3 bg-gradient-to-t from-slate-950/80 via-slate-950/45 to-transparent px-3 py-2 rounded-md">
            <p className="text-xs font-medium text-white">
              Zero surface defects localized — epidermal uniformity within Grade A tolerance.
            </p>
          </div>
        )}
      </div>

      {angles.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {angles.map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              type="button"
              onClick={() => {
                setImgFailed(false);
                setActiveUrl(url);
              }}
              className={`relative w-16 h-12 rounded-md overflow-hidden border transition-all shrink-0 ${
                currentUrl === url
                  ? 'border-emerald-700 ring-2 ring-emerald-700/20'
                  : 'border-slate-200 opacity-75 hover:opacity-100'
              }`}
            >
              <img
                src={url}
                alt={`Angle ${idx + 1}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
