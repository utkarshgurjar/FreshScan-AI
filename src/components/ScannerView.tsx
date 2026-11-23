import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Download,
  FlipHorizontal,
  Loader2,
  Plus,
  RotateCcw,
  ScanLine,
  Thermometer,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type {
  BatchSummary,
  ColorAnalysis,
  FreshnessClass,
  OpticalValidationMetrics,
  ProduceTypeRecord,
  ScanRecord,
  SensorSnapshot,
} from '../types/freshscan';
import { compressImageForUpload, validateProduceImage } from '../utils/imageValidator';
import { downloadFromApi } from '../utils/downloadFile';
import { DefectOverlayViewer } from './DefectOverlayViewer';

interface QueuedAngle {
  id: string;
  file: File;
  previewUrl: string;
  metrics: OpticalValidationMetrics;
  hsvHint: Partial<ColorAnalysis>;
}

interface ScannerViewProps {
  batches: BatchSummary[];
  produceTypes: ProduceTypeRecord[];
  authToken: string | null;
  onScanCreated: (scan: ScanRecord) => void;
}

const STUDIO_SAMPLES = [
  {
    id: 'apple',
    label: 'Honeycrisp Apple',
    subtitle: 'Expected Fresh · Grade A',
    path: '/src/assets/images/sample_apple_fresh_1795378597367.jpg',
  },
  {
    id: 'tomato',
    label: 'Vine Tomatoes',
    subtitle: 'Expected Fresh · Grade A',
    path: '/src/assets/images/sample_tomato_fresh_1795378597486.jpg',
  },
  {
    id: 'banana',
    label: 'Spotted Banana',
    subtitle: 'Expected Overripe · Bruised',
    path: '/src/assets/images/sample_banana_overripe_1795378626365.jpg',
  },
  {
    id: 'mango',
    label: 'Defective Mango',
    subtitle: 'Expected Rotten · Reject',
    path: '/src/assets/images/sample_mango_defective_1795378597053.jpg',
  },
];

export function ScannerView({
  batches,
  produceTypes,
  authToken,
  onScanCreated,
}: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);
  const resultPanelRef = useRef<HTMLDivElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [angles, setAngles] = useState<QueuedAngle[]>([]);
  const [selectedSamplePath, setSelectedSamplePath] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>(batches[0]?.id ?? '');
  const [attachSensors, setAttachSensors] = useState(false);
  const [sensorForm, setSensorForm] = useState<SensorSnapshot>({
    temperatureC: 11.4,
    humidityPct: 88,
    ethylenePpm: 16.5,
    ammoniaPpm: 4.2,
    co2Ppm: 920,
    thermalMaxC: 14.2,
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScanRecord | null>(null);

  // Feedback loop state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [correctedItem, setCorrectedItem] = useState('');
  const [correctedFreshness, setCorrectedFreshness] = useState<FreshnessClass>('Fresh');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  useEffect(() => {
    return () => {
      stopCamera();
      angles.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera API is unavailable in this browser context. Use File Upload or Lab Samples.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        'Could not access webcam (permission denied or no camera attached). You can upload JPG/PNG photos or test with the Studio Lab Samples below.'
      );
    }
  };

  const handleToggleFacing = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (cameraActive) {
      startCamera(next);
    }
  };

  const enqueueValidatedFile = async (file: File) => {
    setValidationError(null);
    if (angles.length >= 4) {
      setValidationError('Maximum of 4 angle photos per inspection item reached.');
      return;
    }
    const check = await validateProduceImage(file, file.name);
    if (!check.metrics.passed && check.errorMessage) {
      setValidationError(check.errorMessage);
      return;
    }
    setSelectedSamplePath(null);
    const uploadReadyFile = await compressImageForUpload(file, 1024, 0.84);
    const previewUrl = URL.createObjectURL(uploadReadyFile);
    setAngles((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: uploadReadyFile,
        previewUrl,
        metrics: check.metrics,
        hsvHint: check.hsvHint,
      },
    ]);
  };

  const handleCaptureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    if (!blob) return;
    const file = new File([blob], `webcam-angle-${angles.length + 1}.jpg`, {
      type: 'image/jpeg',
    });
    await enqueueValidatedFile(file);
  };

  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files).slice(0, 4 - angles.length)) {
      await enqueueValidatedFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAngle = (id: string) => {
    setAngles((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleSelectSample = (samplePath: string) => {
    setValidationError(null);
    angles.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setAngles([]);
    setSelectedSamplePath(samplePath);
  };

  const handleRunAnalysis = async () => {
    if (angles.length === 0 && !selectedSamplePath) {
      setValidationError('Capture a camera frame, upload a photo, or choose a studio sample first.');
      return;
    }

    setAnalyzing(true);
    setValidationError(null);
    setFeedbackOpen(false);
    setFeedbackSubmitted(false);

    try {
      const formData = new FormData();
      if (angles.length > 0) {
        angles.forEach((a) => formData.append('images', a.file));
        formData.append('hsvMetrics', JSON.stringify(angles[0].hsvHint));
        formData.append('opticalMetrics', JSON.stringify(angles[0].metrics));
      } else if (selectedSamplePath) {
        formData.append('sampleImagePath', selectedSamplePath);
      }

      if (selectedBatchId) {
        formData.append('batchId', selectedBatchId);
      }
      if (attachSensors) {
        formData.append('sensorData', JSON.stringify(sensorForm));
      }

      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 55_000);

      let res: Response;
      try {
        res = await fetch('/api/scans', {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      const rawBody = await res.text();
      let payload: Record<string, unknown> | null = null;
      try {
        payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null;
      } catch {
        payload = null;
      }

      if (!res.ok) {
        if (res.status === 413) {
          setValidationError(
            'Uploaded images exceeded the server request size limit. Try fewer angles or smaller photos.'
          );
        } else if (payload && typeof payload.message === 'string') {
          setValidationError(payload.message);
        } else {
          setValidationError(
            `Inspection request failed (HTTP ${res.status}). Please retry in a few seconds.`
          );
        }
        return;
      }

      if (!payload) {
        setValidationError('Inspection server returned an empty response. Please retry.');
        return;
      }

      const scan = payload as unknown as ScanRecord;
      setResult(scan);
      setCorrectedItem(scan.itemType);
      setCorrectedFreshness(scan.freshnessClass);
      setFeedbackNotes('');
      onScanCreated(scan);
      if (window.innerWidth < 1024) {
        requestAnimationFrame(() => {
          resultPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setValidationError(
          'Inspection timed out while waiting for the vision model. Please try again.'
        );
      } else {
        setValidationError(
          'Could not reach the FreshScan AI inspection server. Please check your connection and try again.'
        );
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const submitFeedback = async (isCorrect: boolean) => {
    if (!result) return;
    setSubmittingFeedback(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const res = await fetch(`/api/scans/${result.id}/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          isCorrect,
          correctedItem: isCorrect ? result.itemType : correctedItem,
          correctedFreshness: isCorrect ? result.freshnessClass : correctedFreshness,
          notes: feedbackNotes,
        }),
      });
      if (res.ok) {
        setFeedbackSubmitted(true);
        setFeedbackOpen(false);
      }
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const freshnessColor = (cls: FreshnessClass) => {
    if (cls === 'Fresh') return 'text-emerald-700';
    if (cls === 'Ripe') return 'text-teal-700';
    if (cls === 'Overripe') return 'text-amber-700';
    return 'text-red-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Optical Quality Inspection Workbench
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Capture live camera frames or upload multi-angle produce photos for real-time ripeness, defect localization, and shelf-life grading.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Attach to Batch
          </label>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
          >
            <option value="">Standalone Scan (No Batch)</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.supplier}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main 2-Column Split: Capture Bench (Left) & Inspection Results (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Capture / Upload / Samples / Sensor Attachment */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">1. Image Capture &amp; Validation</h2>
              {cameraActive && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleFacing}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    Flip
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>

            {!cameraActive && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => mobileCameraInputRef.current?.click()}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-[0.98] rounded-lg transition-all whitespace-nowrap"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>Take Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] rounded-lg transition-all whitespace-nowrap"
                >
                  <ScanLine className="w-4 h-4 shrink-0" />
                  <span>Live Cam</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] rounded-lg transition-all whitespace-nowrap"
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span>Gallery</span>
                </button>
              </div>
            )}

            <input
              ref={mobileCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                handleFileSelection(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                handleFileSelection(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>

          {/* Live Webcam or Preview Viewport */}
          {cameraActive ? (
            <div className="space-y-3">
              <div className="relative aspect-[4/3] bg-slate-950 rounded-lg overflow-hidden border border-slate-200">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-6 border border-white/35 rounded-lg pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={handleCaptureFrame}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Capture Angle Frame ({angles.length}/4)
              </button>
            </div>
          ) : selectedSamplePath ? (
            <div className="relative aspect-[4/3] bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
              <img
                src={selectedSamplePath}
                alt="Selected lab produce sample"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelectedSamplePath(null)}
                className="absolute top-3 right-3 px-2.5 py-1 text-xs font-medium bg-white/90 text-slate-800 rounded-md border border-slate-200 hover:bg-white"
              >
                Clear Sample
              </button>
            </div>
          ) : angles.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {angles.map((a, i) => (
                  <div
                    key={a.id}
                    className="relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                  >
                    <img
                      src={a.previewUrl}
                      alt={`Angle ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/80 to-transparent px-2.5 py-1.5 flex items-center justify-between text-xs text-white font-mono tabular-nums">
                      <span>Angle {i + 1}</span>
                      <span>Sharp {a.metrics.sharpnessScore} · Lum {a.metrics.brightnessScore}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAngle(a.id)}
                      aria-label={`Remove angle ${i + 1}`}
                      className="absolute top-2 right-2 p-1 bg-white/90 hover:bg-white text-slate-700 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {angles.length < 4 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-[4/3] rounded-lg border border-dashed border-slate-300 hover:border-emerald-700 hover:bg-emerald-50/30 flex flex-col items-center justify-center gap-1.5 text-xs font-medium text-slate-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Angle ({angles.length}/4)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-mono tabular-nums">
                <span>Optical Precheck: Passed</span>
                <span aria-hidden="true">·</span>
                <span>Sharpness Variance: {angles[0].metrics.sharpnessScore}</span>
                <span aria-hidden="true">·</span>
                <span>Luminance: {angles[0].metrics.brightnessScore}/255</span>
                {angles[0].hsvHint.dominantHex && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      HSV Swatch
                      <span
                        className="inline-block w-3 h-3 rounded-xs border border-slate-300"
                        style={{ backgroundColor: angles[0].hsvHint.dominantHex }}
                      />
                      {angles[0].hsvHint.dominantHex}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="aspect-[16/10] rounded-lg border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-50 hover:border-emerald-700 transition-colors cursor-pointer flex flex-col items-center justify-center p-6 text-center"
            >
              <Upload className="w-7 h-7 text-slate-400 mb-2.5" />
              <p className="text-sm font-medium text-slate-800">
                Drop produce photos here or click to upload
              </p>
              <p className="text-xs text-slate-500 mt-1">
                JPG, PNG, or WebP up to 10 MB · Up to 4 angles · Automatic blur &amp; low-light validation
              </p>
            </div>
          )}

          {(cameraError || validationError) && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span>{validationError || cameraError}</span>
            </div>
          )}

          {/* Studio Lab Quick Samples */}
          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Or test immediately with calibrated studio lab samples
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {STUDIO_SAMPLES.map((s) => {
                const active = selectedSamplePath === s.path;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectSample(s.path)}
                    className={`text-left rounded-lg overflow-hidden border transition-all ${
                      active
                        ? 'border-emerald-700 ring-2 ring-emerald-700/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                      <img
                        src={s.path}
                        alt={s.label}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {s.label}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{s.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Thermal & Gas Sensor Fusion Toggle */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-slate-500" />
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    Thermal &amp; Gas Sensor Fusion (Optional)
                  </div>
                  <div className="text-xs text-slate-500">
                    Leave off for camera-only inspection, or attach MQ-135/MQ-3/MLX90640 readings.
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={attachSensors}
                onClick={() => setAttachSensors((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  attachSensors ? 'bg-emerald-700' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    attachSensors ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {attachSensors && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {[
                  { key: 'temperatureC', label: 'Temp (°C)', step: 0.5 },
                  { key: 'humidityPct', label: 'Humidity (%)', step: 1 },
                  { key: 'ethylenePpm', label: 'Ethylene (ppm)', step: 0.5 },
                  { key: 'ammoniaPpm', label: 'Ammonia (ppm)', step: 0.5 },
                  { key: 'co2Ppm', label: 'CO₂ (ppm)', step: 50 },
                  { key: 'thermalMaxC', label: 'Thermal Peak (°C)', step: 0.5 },
                ].map((field) => (
                  <label key={field.key} className="block space-y-1">
                    <span className="text-xs font-medium text-slate-600">{field.label}</span>
                    <input
                      type="number"
                      step={field.step}
                      value={sensorForm[field.key as keyof SensorSnapshot] as number}
                      onChange={(e) =>
                        setSensorForm((prev) => ({
                          ...prev,
                          [field.key]: Number(e.target.value),
                        }))
                      }
                      className="w-full h-9 px-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:border-emerald-700"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            disabled={analyzing || (angles.length === 0 && !selectedSamplePath)}
            onClick={handleRunAnalysis}
            className="w-full py-3 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running Vision &amp; Defect Inspection...
              </>
            ) : (
              <>
                <ScanLine className="w-4 h-4" />
                Run Quality Inspection
              </>
            )}
          </button>
        </div>

        {/* Right Column: Structured AI Quality Inspection Report */}
        <div
          ref={resultPanelRef}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 scroll-mt-16"
        >
          {!result && !analyzing ? (
            <div className="py-16 px-4 text-center space-y-3">
              <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <ScanLine className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">Ready for Inspection</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Select a calibrated studio sample or capture a photo on the left, then click{' '}
                <strong className="font-medium text-slate-700">Run Quality Inspection</strong> to
                view freshness grading, defect bounding boxes, HSV color metrics, and shelf-life
                estimates.
              </p>
            </div>
          ) : analyzing ? (
            <div className="py-20 px-4 text-center space-y-3">
              <Loader2 className="w-7 h-7 text-emerald-700 animate-spin mx-auto" />
              <h3 className="text-base font-semibold text-slate-900">
                Inspecting Epidermis &amp; Defect Contours
              </h3>
              <p className="text-sm text-slate-500">
                Evaluating produce taxonomy, HSV ripeness index, surface lesions, and shelf-life forecast...
              </p>
            </div>
          ) : result ? (
            <div className="space-y-5">
              {/* Top Result Header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    Scan {result.id} · {result.inferenceTimeMs} ms ·{' '}
                    {result.usedSensorFusion ? 'Vision + Sensor Fusion' : 'Camera Vision Only'}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                    {result.itemType} — Grade {result.qualityGrade}
                  </h2>
                  <div className="flex items-center gap-2 text-sm mt-0.5">
                    <span className={`font-semibold ${freshnessColor(result.freshnessClass)}`}>
                      {result.freshnessClass}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-slate-600 font-mono tabular-nums">
                      Confidence {result.confidence}%
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Quality Score</div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 leading-none mt-0.5">
                    {result.qualityScore}
                    <span className="text-sm font-normal text-slate-400">/100</span>
                  </div>
                </div>
              </div>

              {/* Annotated Defect Overlay Viewer */}
              <DefectOverlayViewer
                imageUrl={result.imageUrl}
                angleImageUrls={result.angleImageUrls}
                itemType={result.itemType}
                defects={result.defects}
              />

              {/* Key Agronomic Metrics Grid (Hairline Separated, Zero Nested Cards) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">Remaining Shelf Life</div>
                  <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {result.estimatedShelfLifeDays}{' '}
                    {result.estimatedShelfLifeDays === 1 ? 'day' : 'days'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Storage Action</div>
                  <div className="text-base font-semibold text-slate-900 mt-0.5">
                    {result.storageRecommendation}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Spoilage Index</div>
                  <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {result.spoilageIndex}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Ripeness (HSV)</div>
                  <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                    {result.colorAnalysis.ripenessIndex}/100
                  </div>
                </div>
              </div>

              {/* Summary & Color Analysis */}
              <div className="space-y-3 text-sm">
                <p className="text-slate-700 leading-relaxed">{result.summaryNotes}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                    <span
                      className="w-3 h-3 rounded-xs border border-slate-300 inline-block"
                      style={{ backgroundColor: result.colorAnalysis.dominantHex }}
                    />
                    {result.colorAnalysis.dominantColor}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    H {result.colorAnalysis.hueAvg}° / S {result.colorAnalysis.saturationAvg}% / V{' '}
                    {result.colorAnalysis.valueAvg}%
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{result.colorAnalysis.hsvSummary}</span>
                </div>
              </div>

              {/* Defect Breakdown Table */}
              {result.defects.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <h3 className="text-xs font-semibold text-slate-500">
                    Localized Defects ({result.defects.length})
                  </h3>
                  <div className="divide-y divide-slate-100">
                    {result.defects.map((d) => (
                      <div key={d.id} className="py-2 flex items-start justify-between gap-3 text-xs">
                        <div>
                          <span className="font-semibold text-slate-900 capitalize">
                            {d.type.replace('_', ' ')}
                          </span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span
                            className={
                              d.severity === 'Severe'
                                ? 'font-semibold text-red-700'
                                : d.severity === 'Moderate'
                                  ? 'font-semibold text-amber-700'
                                  : 'font-medium text-slate-600'
                            }
                          >
                            {d.severity}
                          </span>
                          <p className="text-slate-600 mt-0.5">{d.description}</p>
                        </div>
                        <span className="font-mono tabular-nums text-slate-500 shrink-0">
                          {d.confidence}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Model Feedback Loop */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">
                    Model Feedback Loop — Verify prediction for retraining dataset
                  </span>
                  {feedbackSubmitted ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Saved to Retraining Dataset
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={submittingFeedback}
                        onClick={() => submitFeedback(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Prediction Correct
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedbackOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Correct Label
                      </button>
                    </div>
                  )}
                </div>

                {feedbackOpen && !feedbackSubmitted && (
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-600">Correct Item Type</span>
                        <select
                          value={correctedItem}
                          onChange={(e) => setCorrectedItem(e.target.value)}
                          className="w-full h-9 px-2.5 text-sm bg-white border border-slate-200 rounded-md"
                        >
                          {produceTypes.map((p) => (
                            <option key={p.id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-600">
                          Correct Freshness Class
                        </span>
                        <select
                          value={correctedFreshness}
                          onChange={(e) =>
                            setCorrectedFreshness(e.target.value as FreshnessClass)
                          }
                          className="w-full h-9 px-2.5 text-sm bg-white border border-slate-200 rounded-md"
                        >
                          <option value="Fresh">Fresh</option>
                          <option value="Ripe">Ripe</option>
                          <option value="Overripe">Overripe</option>
                          <option value="Rotten">Rotten</option>
                        </select>
                      </label>
                    </div>
                    <input
                      type="text"
                      value={feedbackNotes}
                      onChange={(e) => setFeedbackNotes(e.target.value)}
                      placeholder="Optional agronomic note (e.g., Brix reading, surface waxing)..."
                      className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-md"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setFeedbackOpen(false)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={submittingFeedback}
                        onClick={() => submitFeedback(false)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
                      >
                        Save Ground Truth
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        downloadFromApi(
                          `/api/scans/${result.id}/report?format=pdf`,
                          `${result.id}-certificate.pdf`,
                          authToken
                        ).catch((err) =>
                          setValidationError(err instanceof Error ? err.message : 'PDF download failed')
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Scan PDF
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadFromApi(
                          `/api/scans/${result.id}/report?format=csv`,
                          `${result.id}-report.csv`,
                          authToken
                        ).catch((err) =>
                          setValidationError(err instanceof Error ? err.message : 'CSV download failed')
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Scan CSV
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Result Panel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
