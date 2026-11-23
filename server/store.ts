import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AlertRecord,
  BatchRecord,
  BatchSummary,
  DashboardSummary,
  FeedbackRecord,
  FreshnessClass,
  ProduceTypeRecord,
  QualityGrade,
  ScanRecord,
  SensorReadingRecord,
  SensorSnapshot,
  SpoilageWeightsConfig,
  UserProfile,
  UserRole,
} from '../src/types/freshscan.ts';

export interface StoredUser extends UserProfile {
  passwordHash: string;
  passwordSalt: string;
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function generateThermalMatrix(baseTemp: number, hotspotDelta: number): number[][] {
  const matrix: number[][] = [];
  for (let r = 0; r < 8; r++) {
    const row: number[] = [];
    for (let c = 0; c < 8; c++) {
      const dist = Math.hypot(r - 3.5, c - 4.2);
      const bump = Math.max(0, 1 - dist / 4.5) * hotspotDelta;
      const jitter = ((r * 7 + c * 13) % 5) * 0.12 - 0.25;
      row.push(Number((baseTemp + bump + jitter).toFixed(1)));
    }
    matrix.push(row);
  }
  return matrix;
}

export class FreshScanStore {
  users: StoredUser[] = [];
  adminClaimedHash: { hash: string; salt: string } | null = null;
  produceTypes: ProduceTypeRecord[] = [];
  batches: BatchRecord[] = [];
  scans: ScanRecord[] = [];
  sensorReadings: SensorReadingRecord[] = [];
  feedbacks: FeedbackRecord[] = [];
  alerts: AlertRecord[] = [];
  config: SpoilageWeightsConfig = {
    visualWeight: 0.55,
    ethyleneWeight: 0.18,
    ammoniaWeight: 0.12,
    temperatureWeight: 0.10,
    humidityWeight: 0.05,
    thresholds: {
      maxTempC: 14.0,
      maxHumidityPct: 92.0,
      maxEthylenePpm: 25.0,
      maxAmmoniaPpm: 15.0,
      maxCo2Ppm: 1800,
      maxThermalSpotC: 22.0,
    },
  };

  private readonly stateFilePath = path.resolve(process.cwd(), 'data', 'freshscan-state.json');

  constructor() {
    if (!this.loadFromDisk()) {
      this.seedInitialData();
      this.persist();
    }
  }

  private loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(this.stateFilePath)) return false;
      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.batches) || !Array.isArray(parsed.scans)) return false;
      this.users = parsed.users ?? [];
      this.adminClaimedHash = parsed.adminClaimedHash ?? null;
      this.produceTypes = parsed.produceTypes ?? [];
      this.batches = parsed.batches ?? [];
      this.scans = parsed.scans ?? [];
      this.sensorReadings = parsed.sensorReadings ?? [];
      this.feedbacks = parsed.feedbacks ?? [];
      this.alerts = parsed.alerts ?? [];
      if (parsed.config) this.config = parsed.config;
      return true;
    } catch {
      return false;
    }
  }

  persist(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.stateFilePath}.tmp`;
      fs.writeFileSync(
        tmp,
        JSON.stringify(
          {
            users: this.users,
            adminClaimedHash: this.adminClaimedHash,
            produceTypes: this.produceTypes,
            batches: this.batches,
            scans: this.scans,
            sensorReadings: this.sensorReadings,
            feedbacks: this.feedbacks,
            alerts: this.alerts,
            config: this.config,
          },
          null,
          2
        ),
        'utf8'
      );
      fs.renameSync(tmp, this.stateFilePath);
    } catch {
      // Non-fatal in read-only sandboxes
    }
  }

  private seedInitialData(): void {
    const now = Date.now();
    const dayMs = 86400_000;

    // Seed non-privileged demo Inspector & User profiles (users can register or claim Admin anytime)
    const demoPass = hashPassword('inspector-preview');
    this.users = [
      {
        id: 'usr-inspector-1',
        name: 'Elena Vance',
        email: 'inspector@freshscan.local',
        role: 'INSPECTOR',
        createdAt: new Date(now - 14 * dayMs).toISOString(),
        passwordHash: demoPass.hash,
        passwordSalt: demoPass.salt,
      },
      {
        id: 'usr-user-1',
        name: 'Marcus Chen',
        email: 'operator@freshscan.local',
        role: 'USER',
        createdAt: new Date(now - 9 * dayMs).toISOString(),
        passwordHash: demoPass.hash,
        passwordSalt: demoPass.salt,
      },
    ];

    this.produceTypes = [
      { id: 'pt-apple', name: 'Apple', category: 'Fruit', optimalTempC: '1–4 °C', optimalHumidityPct: '90–95%', baselineShelfLifeDays: 21, ethyleneSensitivity: 'High', gradeAMinScore: 85, gradeBMinScore: 68, gradeCMinScore: 45 },
      { id: 'pt-banana', name: 'Banana', category: 'Fruit', optimalTempC: '13–15 °C', optimalHumidityPct: '85–90%', baselineShelfLifeDays: 6, ethyleneSensitivity: 'High', gradeAMinScore: 84, gradeBMinScore: 65, gradeCMinScore: 42 },
      { id: 'pt-tomato', name: 'Tomato', category: 'Vegetable', optimalTempC: '10–13 °C', optimalHumidityPct: '85–90%', baselineShelfLifeDays: 10, ethyleneSensitivity: 'High', gradeAMinScore: 85, gradeBMinScore: 68, gradeCMinScore: 45 },
      { id: 'pt-mango', name: 'Mango', category: 'Fruit', optimalTempC: '10–13 °C', optimalHumidityPct: '85–90%', baselineShelfLifeDays: 8, ethyleneSensitivity: 'High', gradeAMinScore: 84, gradeBMinScore: 66, gradeCMinScore: 45 },
      { id: 'pt-potato', name: 'Potato', category: 'Vegetable', optimalTempC: '7–10 °C', optimalHumidityPct: '90–95%', baselineShelfLifeDays: 45, ethyleneSensitivity: 'Low', gradeAMinScore: 82, gradeBMinScore: 64, gradeCMinScore: 40 },
      { id: 'pt-orange', name: 'Orange', category: 'Fruit', optimalTempC: '3–8 °C', optimalHumidityPct: '85–90%', baselineShelfLifeDays: 28, ethyleneSensitivity: 'Low', gradeAMinScore: 85, gradeBMinScore: 68, gradeCMinScore: 45 },
      { id: 'pt-strawberry', name: 'Strawberry', category: 'Fruit', optimalTempC: '0–2 °C', optimalHumidityPct: '90–95%', baselineShelfLifeDays: 4, ethyleneSensitivity: 'Medium', gradeAMinScore: 88, gradeBMinScore: 70, gradeCMinScore: 48 },
      { id: 'pt-pepper', name: 'Bell Pepper', category: 'Vegetable', optimalTempC: '7–10 °C', optimalHumidityPct: '90–95%', baselineShelfLifeDays: 14, ethyleneSensitivity: 'Medium', gradeAMinScore: 84, gradeBMinScore: 65, gradeCMinScore: 44 },
      { id: 'pt-cucumber', name: 'Cucumber', category: 'Vegetable', optimalTempC: '10–12 °C', optimalHumidityPct: '90–95%', baselineShelfLifeDays: 12, ethyleneSensitivity: 'High', gradeAMinScore: 85, gradeBMinScore: 67, gradeCMinScore: 45 },
      { id: 'pt-grapes', name: 'Grapes', category: 'Fruit', optimalTempC: '0–2 °C', optimalHumidityPct: '90–95%', baselineShelfLifeDays: 14, ethyleneSensitivity: 'Low', gradeAMinScore: 86, gradeBMinScore: 68, gradeCMinScore: 46 },
      { id: 'pt-avocado', name: 'Avocado', category: 'Fruit', optimalTempC: '5–12 °C', optimalHumidityPct: '85–90%', baselineShelfLifeDays: 7, ethyleneSensitivity: 'High', gradeAMinScore: 84, gradeBMinScore: 66, gradeCMinScore: 44 },
      { id: 'pt-carrot', name: 'Carrot', category: 'Vegetable', optimalTempC: '0–2 °C', optimalHumidityPct: '95–98%', baselineShelfLifeDays: 30, ethyleneSensitivity: 'Medium', gradeAMinScore: 83, gradeBMinScore: 65, gradeCMinScore: 42 },
    ];

    this.batches = [
      {
        id: 'batch-101',
        code: 'LOT-2026-041',
        supplier: 'Cascade Valley Orchards',
        produceCategory: 'Pome & Vine Produce',
        receivedDate: new Date(now - 2 * dayMs).toISOString().slice(0, 10),
        storageLocation: 'Cold Chamber A2 (3.5 °C)',
        createdBy: 'Elena Vance',
        createdAt: new Date(now - 2 * dayMs).toISOString(),
        notes: 'Morning harvest inspection lot, pre-cooled before loading.',
      },
      {
        id: 'batch-102',
        code: 'LOT-2026-042',
        supplier: 'Tropicana Coast Exporters',
        produceCategory: 'Tropical Climacteric Fruits',
        receivedDate: new Date(now - 1 * dayMs).toISOString().slice(0, 10),
        storageLocation: 'Ripening Bay B4 (13.8 °C)',
        createdBy: 'Elena Vance',
        createdAt: new Date(now - 1 * dayMs).toISOString(),
        notes: 'Container #TC-884; elevated ethylene logged during transit.',
      },
    ];

    this.scans = [
      {
        id: 'scn-1001',
        batchId: 'batch-101',
        userId: 'usr-inspector-1',
        inspectorName: 'Elena Vance',
        createdAt: new Date(now - 36 * 3600_000).toISOString(),
        imageUrl: '/src/assets/images/sample_apple_fresh_1795378597367.jpg',
        angleImageUrls: ['/src/assets/images/sample_apple_fresh_1795378597367.jpg'],
        itemType: 'Apple',
        freshnessClass: 'Fresh',
        qualityGrade: 'A',
        visualScore: 95,
        qualityScore: 94,
        spoilageIndex: 6,
        confidence: 97.4,
        defects: [],
        colorAnalysis: {
          dominantColor: 'Crimson Red',
          dominantHex: '#B6382C',
          ripenessIndex: 82,
          hueAvg: 8,
          saturationAvg: 71,
          valueAvg: 68,
          hsvSummary: 'Uniform anthocyanin red skin coloration with crisp yellow-green lenticels.',
        },
        estimatedShelfLifeDays: 18,
        storageRecommendation: 'Refrigerate',
        summaryNotes: 'Firm Honeycrisp epidermal skin with intact stem and zero mechanical bruising or decay.',
        inferenceTimeMs: 412,
        usedSensorFusion: true,
        sensorSnapshot: {
          temperatureC: 3.4,
          humidityPct: 91,
          ethylenePpm: 2.1,
          ammoniaPpm: 0.4,
          co2Ppm: 490,
          thermalMaxC: 4.8,
          thermalMinC: 3.1,
        },
      },
      {
        id: 'scn-1002',
        batchId: 'batch-101',
        userId: 'usr-inspector-1',
        inspectorName: 'Elena Vance',
        createdAt: new Date(now - 26 * 3600_000).toISOString(),
        imageUrl: '/src/assets/images/sample_tomato_fresh_1795378597486.jpg',
        angleImageUrls: ['/src/assets/images/sample_tomato_fresh_1795378597486.jpg'],
        itemType: 'Tomato',
        freshnessClass: 'Fresh',
        qualityGrade: 'A',
        visualScore: 92,
        qualityScore: 91,
        spoilageIndex: 9,
        confidence: 96.1,
        defects: [],
        colorAnalysis: {
          dominantColor: 'Vibrant Scarlet',
          dominantHex: '#C9301C',
          ripenessIndex: 88,
          hueAvg: 7,
          saturationAvg: 84,
          valueAvg: 76,
          hsvSummary: 'High lycopene saturation with turgid green calyx indicating recent harvest.',
        },
        estimatedShelfLifeDays: 8,
        storageRecommendation: 'Room Temperature',
        summaryNotes: 'Glossy cuticle with intact green truss stem and no radial cracking or blossom-end rot.',
        inferenceTimeMs: 386,
        usedSensorFusion: false,
      },
      {
        id: 'scn-1003',
        batchId: 'batch-102',
        userId: 'usr-inspector-1',
        inspectorName: 'Elena Vance',
        createdAt: new Date(now - 14 * 3600_000).toISOString(),
        imageUrl: '/src/assets/images/sample_banana_overripe_1795378626365.jpg',
        angleImageUrls: ['/src/assets/images/sample_banana_overripe_1795378626365.jpg'],
        itemType: 'Banana',
        freshnessClass: 'Overripe',
        qualityGrade: 'C',
        visualScore: 54,
        qualityScore: 49,
        spoilageIndex: 51,
        confidence: 94.8,
        defects: [
          {
            id: 'def-201',
            type: 'bruises',
            severity: 'Moderate',
            confidence: 92,
            description: 'Localized dark impact bruise along lower right peel curvature.',
            bbox: [470, 520, 625, 675],
          },
          {
            id: 'def-202',
            type: 'dark_spots',
            severity: 'Moderate',
            confidence: 95,
            description: 'Dense senescence sugar spotting across both fingers.',
            bbox: [245, 110, 610, 650],
          },
        ],
        colorAnalysis: {
          dominantColor: 'Spotted Amber Yellow',
          dominantHex: '#D8B243',
          ripenessIndex: 94,
          hueAvg: 44,
          saturationAvg: 65,
          valueAvg: 81,
          hsvSummary: 'Stage 7 post-climacteric yellowing with 24% dark melanin flecking.',
        },
        estimatedShelfLifeDays: 1,
        storageRecommendation: 'Consume Today',
        summaryNotes: 'Advanced ripening with mechanical bruise near distal end; divert to immediate retail markdown or processing.',
        inferenceTimeMs: 445,
        usedSensorFusion: true,
        sensorSnapshot: {
          temperatureC: 15.8,
          humidityPct: 88,
          ethylenePpm: 31.4,
          ammoniaPpm: 4.8,
          co2Ppm: 1420,
          thermalMaxC: 18.6,
          thermalMinC: 14.9,
        },
      },
      {
        id: 'scn-1004',
        batchId: 'batch-102',
        userId: 'usr-user-1',
        inspectorName: 'Marcus Chen',
        createdAt: new Date(now - 5 * 3600_000).toISOString(),
        imageUrl: '/src/assets/images/sample_mango_defective_1795378597053.jpg',
        angleImageUrls: ['/src/assets/images/sample_mango_defective_1795378597053.jpg'],
        itemType: 'Mango',
        freshnessClass: 'Rotten',
        qualityGrade: 'Reject',
        visualScore: 24,
        qualityScore: 21,
        spoilageIndex: 79,
        confidence: 96.7,
        defects: [
          {
            id: 'def-301',
            type: 'dark_spots',
            severity: 'Severe',
            confidence: 97,
            description: 'Sunken necrotic anthracnose lesions clustered on central epidermis.',
            bbox: [285, 315, 595, 535],
          },
          {
            id: 'def-302',
            type: 'wrinkles',
            severity: 'Severe',
            confidence: 91,
            description: 'Desiccated wrinkling and exudate breakdown around lower right stem end.',
            bbox: [495, 540, 725, 755],
          },
        ],
        colorAnalysis: {
          dominantColor: 'Dull Ochre & Black',
          dominantHex: '#B68129',
          ripenessIndex: 98,
          hueAvg: 37,
          saturationAvg: 69,
          valueAvg: 62,
          hsvSummary: 'Significant low-luminance necrotic dark pixel clusters exceeding 18% surface area.',
        },
        estimatedShelfLifeDays: 0,
        storageRecommendation: 'Discard',
        summaryNotes: 'Severe anthracnose fungal spotting and soft exudate decay. Quarantine immediately to prevent cross-contamination.',
        inferenceTimeMs: 468,
        usedSensorFusion: true,
        sensorSnapshot: {
          temperatureC: 17.4,
          humidityPct: 93,
          ethylenePpm: 38.2,
          ammoniaPpm: 18.6,
          co2Ppm: 2110,
          thermalMaxC: 23.4,
          thermalMinC: 16.8,
        },
      },
    ];

    // Seed sensor time-series readings for both batches
    const hoursBack = [24, 20, 16, 12, 8, 4, 1];
    hoursBack.forEach((h, idx) => {
      const ts = new Date(now - h * 3600_000).toISOString();
      // Batch 101 nominal cold storage
      const temp1 = Number((3.2 + (idx % 3) * 0.2).toFixed(1));
      const hum1 = Number((90.5 + (idx % 2) * 0.8).toFixed(1));
      const eth1 = Number((1.8 + idx * 0.15).toFixed(1));
      const amm1 = Number((0.4 + idx * 0.05).toFixed(1));
      this.sensorReadings.push({
        id: `sr-101-${idx}`,
        batchId: 'batch-101',
        deviceId: 'ESP32-NODE-A2',
        recordedAt: ts,
        temperatureC: temp1,
        humidityPct: hum1,
        ethylenePpm: eth1,
        ammoniaPpm: amm1,
        co2Ppm: 460 + idx * 14,
        thermalMaxC: Number((temp1 + 1.4).toFixed(1)),
        thermalMinC: Number((temp1 - 0.3).toFixed(1)),
        thermalMatrix: generateThermalMatrix(temp1, 1.4),
        computedSpoilageRisk: 11 + idx,
      });

      // Batch 102 escalating ripening / spoilage risk
      const temp2 = Number((13.4 + idx * 0.65).toFixed(1));
      const hum2 = Number((86.0 + idx * 1.1).toFixed(1));
      const eth2 = Number((14.5 + idx * 3.9).toFixed(1));
      const amm2 = Number((2.2 + idx * 2.7).toFixed(1));
      this.sensorReadings.push({
        id: `sr-102-${idx}`,
        batchId: 'batch-102',
        deviceId: 'ESP32-NODE-B4',
        recordedAt: ts,
        temperatureC: temp2,
        humidityPct: hum2,
        ethylenePpm: eth2,
        ammoniaPpm: amm2,
        co2Ppm: 980 + idx * 190,
        thermalMaxC: Number((temp2 + 4.8).toFixed(1)),
        thermalMinC: Number((temp2 - 0.4).toFixed(1)),
        thermalMatrix: generateThermalMatrix(temp2, 4.8),
        computedSpoilageRisk: Math.min(96, 28 + idx * 11),
      });
    });

    this.alerts = [
      {
        id: 'al-901',
        batchId: 'batch-102',
        batchCode: 'LOT-2026-042',
        severity: 'CRITICAL',
        metric: 'Ethylene (C₂H₄)',
        measuredValue: 37.9,
        thresholdValue: 25.0,
        message: 'Ethylene concentration (37.9 ppm) exceeded 25.0 ppm threshold in Ripening Bay B4.',
        createdAt: new Date(now - 3600_000).toISOString(),
        acknowledged: false,
      },
      {
        id: 'al-902',
        batchId: 'batch-102',
        batchCode: 'LOT-2026-042',
        severity: 'WARNING',
        metric: 'Ammonia (NH₃)',
        measuredValue: 18.4,
        thresholdValue: 15.0,
        message: 'Ammonia off-gassing (18.4 ppm) indicates microbial decay onset in LOT-2026-042.',
        createdAt: new Date(now - 2 * 3600_000).toISOString(),
        acknowledged: false,
      },
    ];

    this.feedbacks = [
      {
        id: 'fb-501',
        scanId: 'scn-1001',
        userId: 'usr-inspector-1',
        isCorrect: true,
        predictedItem: 'Apple',
        correctedItem: 'Apple',
        predictedFreshness: 'Fresh',
        correctedFreshness: 'Fresh',
        notes: 'Verified with Brix refractometer (13.4 °Bx) and Magness-Taylor firmness gauge.',
        imageUrl: '/src/assets/images/sample_apple_fresh_1795378597367.jpg',
        createdAt: new Date(now - 30 * 3600_000).toISOString(),
      },
    ];
  }

  computeSensorSpoilageRisk(s: SensorSnapshot): number {
    const t = this.config.thresholds;
    const ethNorm = Math.min(100, (Math.max(0, s.ethylenePpm) / Math.max(1, t.maxEthylenePpm * 1.5)) * 100);
    const ammNorm = Math.min(100, (Math.max(0, s.ammoniaPpm) / Math.max(1, t.maxAmmoniaPpm * 1.5)) * 100);
    const tempNorm = Math.min(100, (Math.max(0, s.temperatureC - 4) / Math.max(1, t.maxTempC + 10)) * 100);
    const humExcess = Math.max(0, Math.abs(s.humidityPct - 85) - 5);
    const humNorm = Math.min(100, (humExcess / 25) * 100);
    const thermalBonus =
      s.thermalMaxC && s.thermalMaxC > t.maxThermalSpotC
        ? Math.min(25, (s.thermalMaxC - t.maxThermalSpotC) * 4)
        : 0;

    const sensorWeightSum =
      this.config.ethyleneWeight +
      this.config.ammoniaWeight +
      this.config.temperatureWeight +
      this.config.humidityWeight;

    const safeSum = sensorWeightSum > 0 ? sensorWeightSum : 1;
    const weighted =
      (ethNorm * this.config.ethyleneWeight +
        ammNorm * this.config.ammoniaWeight +
        tempNorm * this.config.temperatureWeight +
        humNorm * this.config.humidityWeight) /
      safeSum;

    return Math.round(Math.min(100, Math.max(0, weighted + thermalBonus)));
  }

  fuseVisualAndSensorScore(visualScore: number, sensor?: SensorSnapshot): {
    finalQualityScore: number;
    spoilageIndex: number;
    qualityGrade: QualityGrade;
  } {
    const visualSpoilage = Math.max(0, Math.min(100, 100 - visualScore));
    if (!sensor) {
      const grade = this.gradeFromScore(visualScore);
      return {
        finalQualityScore: Math.round(visualScore),
        spoilageIndex: Math.round(visualSpoilage),
        qualityGrade: grade,
      };
    }

    const sensorSpoilage = this.computeSensorSpoilageRisk(sensor);
    const wVisual = this.config.visualWeight;
    const wSensor = Math.max(0, 1 - wVisual);
    const fusedSpoilage = Math.round(
      Math.min(100, Math.max(0, visualSpoilage * wVisual + sensorSpoilage * wSensor))
    );
    const finalQualityScore = Math.max(0, Math.min(100, 100 - fusedSpoilage));
    return {
      finalQualityScore,
      spoilageIndex: fusedSpoilage,
      qualityGrade: this.gradeFromScore(finalQualityScore),
    };
  }

  gradeFromScore(score: number): QualityGrade {
    if (score >= 82) return 'A';
    if (score >= 65) return 'B';
    if (score >= 42) return 'C';
    return 'Reject';
  }

  evaluateThresholdsAndRaiseAlerts(reading: SensorReadingRecord): AlertRecord[] {
    const batch = this.batches.find((b) => b.id === reading.batchId);
    const batchCode = batch ? batch.code : reading.batchId;
    const t = this.config.thresholds;
    const raised: AlertRecord[] = [];

    const check = (
      metric: string,
      value: number,
      threshold: number,
      unit: string,
      criticalRatio: number
    ) => {
      if (value > threshold) {
        const severity: 'WARNING' | 'CRITICAL' =
          value >= threshold * criticalRatio ? 'CRITICAL' : 'WARNING';
        const alert: AlertRecord = {
          id: `al-${crypto.randomUUID().slice(0, 8)}`,
          batchId: reading.batchId,
          batchCode,
          severity,
          metric,
          measuredValue: Number(value.toFixed(1)),
          thresholdValue: threshold,
          message: `${metric} reached ${value.toFixed(1)} ${unit} (threshold ${threshold} ${unit}) on ${batchCode}.`,
          createdAt: reading.recordedAt,
          acknowledged: false,
        };
        this.alerts.unshift(alert);
        raised.push(alert);
      }
    };

    check('Temperature', reading.temperatureC, t.maxTempC, '°C', 1.25);
    check('Humidity', reading.humidityPct, t.maxHumidityPct, '%', 1.06);
    check('Ethylene (C₂H₄)', reading.ethylenePpm, t.maxEthylenePpm, 'ppm', 1.4);
    check('Ammonia (NH₃)', reading.ammoniaPpm, t.maxAmmoniaPpm, 'ppm', 1.35);
    check('CO₂', reading.co2Ppm, t.maxCo2Ppm, 'ppm', 1.3);
    check('Thermal Hotspot', reading.thermalMaxC, t.maxThermalSpotC, '°C', 1.2);

    return raised;
  }

  getBatchSummaries(): BatchSummary[] {
    return this.batches.map((b) => {
      const batchScans = this.scans.filter((s) => s.batchId === b.id);
      const total = batchScans.length;
      const countClass = (cls: FreshnessClass) =>
        batchScans.filter((s) => s.freshnessClass === cls).length;

      const avgScore =
        total > 0
          ? Math.round(batchScans.reduce((acc, s) => acc + s.qualityScore, 0) / total)
          : 0;

      const readings = this.sensorReadings
        .filter((r) => r.batchId === b.id)
        .sort((a, c) => c.recordedAt.localeCompare(a.recordedAt));

      const activeAlerts = this.alerts.filter(
        (al) => al.batchId === b.id && !al.acknowledged
      ).length;

      return {
        ...b,
        totalScans: total,
        freshPct: total ? Math.round((countClass('Fresh') / total) * 100) : 0,
        ripePct: total ? Math.round((countClass('Ripe') / total) * 100) : 0,
        overripePct: total ? Math.round((countClass('Overripe') / total) * 100) : 0,
        rottenPct: total ? Math.round((countClass('Rotten') / total) * 100) : 0,
        averageScore: avgScore,
        latestSensor: readings[0],
        activeAlerts,
      };
    });
  }

  getDashboardSummary(): DashboardSummary {
    const totalScans = this.scans.length;
    const freshCount = this.scans.filter((s) => s.freshnessClass === 'Fresh').length;
    const ripeCount = this.scans.filter((s) => s.freshnessClass === 'Ripe').length;
    const overripeCount = this.scans.filter((s) => s.freshnessClass === 'Overripe').length;
    const rottenCount = this.scans.filter((s) => s.freshnessClass === 'Rotten').length;

    const freshVsRottenRatio =
      rottenCount === 0
        ? freshCount + ripeCount
        : Number(((freshCount + ripeCount) / rottenCount).toFixed(2));

    const averageQualityScore =
      totalScans > 0
        ? Math.round(this.scans.reduce((acc, s) => acc + s.qualityScore, 0) / totalScans)
        : 0;

    // Daily breakdown (last 5 days + today)
    const dayMap = new Map<
      string,
      { date: string; fresh: number; ripe: number; overripe: number; rotten: number; total: number }
    >();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      dayMap.set(d, { date: d.slice(5), fresh: 0, ripe: 0, overripe: 0, rotten: 0, total: 0 });
    }
    for (const s of this.scans) {
      const key = s.createdAt.slice(0, 10);
      const entry =
        dayMap.get(key) ?? {
          date: key.slice(5),
          fresh: 0,
          ripe: 0,
          overripe: 0,
          rotten: 0,
          total: 0,
        };
      if (s.freshnessClass === 'Fresh') entry.fresh++;
      else if (s.freshnessClass === 'Ripe') entry.ripe++;
      else if (s.freshnessClass === 'Overripe') entry.overripe++;
      else entry.rotten++;
      entry.total++;
      dayMap.set(key, entry);
    }

    const grades: QualityGrade[] = ['A', 'B', 'C', 'Reject'];
    const qualityDistribution = grades.map((grade) => ({
      grade,
      count: this.scans.filter((s) => s.qualityGrade === grade).length,
    }));

    const itemGroups = new Map<string, number[]>();
    for (const s of this.scans) {
      const list = itemGroups.get(s.itemType) ?? [];
      list.push(s.qualityScore);
      itemGroups.set(s.itemType, list);
    }
    const averageByItem = Array.from(itemGroups.entries())
      .map(([item, scores]) => ({
        item,
        avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        scans: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const defectMap = new Map<string, { count: number; severities: number[] }>();
    const sevWeight = { Low: 1, Moderate: 2, Severe: 3 };
    for (const s of this.scans) {
      for (const d of s.defects) {
        const cur = defectMap.get(d.type) ?? { count: 0, severities: [] };
        cur.count++;
        cur.severities.push(sevWeight[d.severity]);
        defectMap.set(d.type, cur);
      }
    }
    const topDefects = Array.from(defectMap.entries())
      .map(([type, info]) => {
        const avg = info.severities.reduce((a, b) => a + b, 0) / info.severities.length;
        return {
          type: type.replace('_', ' '),
          count: info.count,
          avgSeverity: avg >= 2.5 ? 'Severe' : avg >= 1.5 ? 'Moderate' : 'Low',
        };
      })
      .sort((a, b) => b.count - a.count);

    const sensorTrends = [...this.sensorReadings]
      .filter((r) => r.batchId === 'batch-102' || this.batches.length === 1)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
      .slice(-10)
      .map((r) => ({
        time: new Date(r.recordedAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        temperatureC: r.temperatureC,
        humidityPct: r.humidityPct,
        ethylenePpm: r.ethylenePpm,
        ammoniaPpm: r.ammoniaPpm,
      }));

    const correctFb = this.feedbacks.filter((f) => f.isCorrect).length;
    const modelAccuracyPct =
      this.feedbacks.length > 0 ? Math.round((correctFb / this.feedbacks.length) * 100) : 96;

    return {
      totalScans,
      freshCount,
      ripeCount,
      overripeCount,
      rottenCount,
      freshVsRottenRatio,
      averageQualityScore,
      activeAlertsCount: this.alerts.filter((a) => !a.acknowledged).length,
      feedbackCount: this.feedbacks.length,
      modelAccuracyPct,
      dailyScans: Array.from(dayMap.values()),
      qualityDistribution,
      averageByItem,
      topDefects,
      sensorTrends,
    };
  }
}

export const store = new FreshScanStore();
