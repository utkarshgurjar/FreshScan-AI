export type UserRole = 'ADMIN' | 'INSPECTOR' | 'USER';

export type FreshnessClass = 'Fresh' | 'Ripe' | 'Overripe' | 'Rotten';

export type QualityGrade = 'A' | 'B' | 'C' | 'Reject';

export type StorageRecommendation =
  | 'Refrigerate'
  | 'Room Temperature'
  | 'Consume Today'
  | 'Discard';

export type DefectType =
  | 'bruises'
  | 'dark_spots'
  | 'mold'
  | 'wrinkles'
  | 'cuts'
  | 'insect_damage';

export interface DefectBox {
  id: string;
  type: DefectType;
  severity: 'Low' | 'Moderate' | 'Severe';
  confidence: number;
  description: string;
  /** Normalized [ymin, xmin, ymax, xmax] in 0..1000 coordinates */
  bbox: [number, number, number, number];
}

export interface ColorAnalysis {
  dominantColor: string;
  dominantHex: string;
  ripenessIndex: number; // 0..100
  hueAvg: number; // 0..360
  saturationAvg: number; // 0..100
  valueAvg: number; // 0..100
  hsvSummary: string;
}

export interface OpticalValidationMetrics {
  width: number;
  height: number;
  fileSizeBytes: number;
  sharpnessScore: number; // Laplacian variance
  brightnessScore: number; // 0..255
  passed: boolean;
  warnings: string[];
}

export interface SensorSnapshot {
  temperatureC: number;
  humidityPct: number;
  ethylenePpm: number;
  ammoniaPpm: number;
  co2Ppm: number;
  thermalMaxC?: number;
  thermalMinC?: number;
  thermalMatrix?: number[][]; // 8x8 matrix
}

export interface ScanRecord {
  id: string;
  batchId: string | null;
  userId: string;
  inspectorName: string;
  createdAt: string;
  imageUrl: string;
  angleImageUrls: string[];
  itemType: string;
  freshnessClass: FreshnessClass;
  qualityGrade: QualityGrade;
  visualScore: number; // 0..100 pure vision score
  qualityScore: number; // 0..100 final fused score
  spoilageIndex: number; // 0..100 higher means more spoiled
  confidence: number; // 0..100
  defects: DefectBox[];
  colorAnalysis: ColorAnalysis;
  estimatedShelfLifeDays: number;
  storageRecommendation: StorageRecommendation;
  summaryNotes: string;
  inferenceTimeMs: number;
  usedSensorFusion: boolean;
  sensorSnapshot?: SensorSnapshot;
  opticalMetrics?: OpticalValidationMetrics;
  feedback?: FeedbackRecord;
}

export interface BatchRecord {
  id: string;
  code: string;
  supplier: string;
  produceCategory: string;
  receivedDate: string;
  storageLocation: string;
  createdBy: string;
  createdAt: string;
  notes: string;
}

export interface BatchSummary extends BatchRecord {
  totalScans: number;
  freshPct: number;
  ripePct: number;
  overripePct: number;
  rottenPct: number;
  averageScore: number;
  latestSensor?: SensorReadingRecord;
  activeAlerts: number;
}

export interface SensorReadingRecord {
  id: string;
  batchId: string;
  deviceId: string;
  recordedAt: string;
  temperatureC: number;
  humidityPct: number;
  ethylenePpm: number;
  ammoniaPpm: number;
  co2Ppm: number;
  thermalMaxC: number;
  thermalMinC: number;
  thermalMatrix: number[][];
  computedSpoilageRisk: number; // 0..100
}

export interface AlertRecord {
  id: string;
  batchId: string;
  batchCode: string;
  severity: 'WARNING' | 'CRITICAL';
  metric: string;
  measuredValue: number;
  thresholdValue: number;
  message: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface ProduceTypeRecord {
  id: string;
  name: string;
  category: 'Fruit' | 'Vegetable';
  optimalTempC: string;
  optimalHumidityPct: string;
  baselineShelfLifeDays: number;
  ethyleneSensitivity: 'Low' | 'Medium' | 'High';
  gradeAMinScore: number;
  gradeBMinScore: number;
  gradeCMinScore: number;
}

export interface FeedbackRecord {
  id: string;
  scanId: string;
  userId: string;
  isCorrect: boolean;
  predictedItem: string;
  correctedItem: string;
  predictedFreshness: FreshnessClass;
  correctedFreshness: FreshnessClass;
  notes: string;
  imageUrl: string;
  createdAt: string;
}

export interface SpoilageWeightsConfig {
  visualWeight: number; // default 0.55
  ethyleneWeight: number; // default 0.18
  ammoniaWeight: number; // default 0.12
  temperatureWeight: number; // default 0.10
  humidityWeight: number; // default 0.05
  thresholds: {
    maxTempC: number;
    maxHumidityPct: number;
    maxEthylenePpm: number;
    maxAmmoniaPpm: number;
    maxCo2Ppm: number;
    maxThermalSpotC: number;
  };
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface DashboardSummary {
  totalScans: number;
  freshCount: number;
  ripeCount: number;
  overripeCount: number;
  rottenCount: number;
  freshVsRottenRatio: number;
  averageQualityScore: number;
  activeAlertsCount: number;
  feedbackCount: number;
  modelAccuracyPct: number;
  dailyScans: Array<{ date: string; fresh: number; ripe: number; overripe: number; rotten: number; total: number }>;
  qualityDistribution: Array<{ grade: QualityGrade; count: number }>;
  averageByItem: Array<{ item: string; avgScore: number; scans: number }>;
  topDefects: Array<{ type: string; count: number; avgSeverity: string }>;
  sensorTrends: Array<{
    time: string;
    temperatureC: number;
    humidityPct: number;
    ethylenePpm: number;
    ammoniaPpm: number;
  }>;
}
