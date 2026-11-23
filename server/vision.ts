import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  ColorAnalysis,
  DefectBox,
  FreshnessClass,
  QualityGrade,
  StorageRecommendation,
} from '../src/types/freshscan.ts';

let cachedClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please verify your API key in Settings > Secrets.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export interface VisionInspectionInput {
  images: Array<{ mimeType: string; base64Data: string }>;
  clientHsvHint?: Partial<ColorAnalysis>;
  supportedProduceClasses: string[];
}

export interface VisionInspectionOutput {
  isProducePresent: boolean;
  rejectionReason?: string;
  itemType: string;
  freshnessClass: FreshnessClass;
  qualityGrade: QualityGrade;
  visualScore: number;
  confidence: number;
  defects: DefectBox[];
  colorAnalysis: ColorAnalysis;
  estimatedShelfLifeDays: number;
  storageRecommendation: StorageRecommendation;
  summaryNotes: string;
  inferenceTimeMs: number;
}

const INSPECTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isProducePresent: {
      type: Type.BOOLEAN,
      description: 'True if at least one fruit or vegetable is clearly visible in the photo(s).',
    },
    rejectionReason: {
      type: Type.STRING,
      description:
        'If isProducePresent is false, or the image is unusable/unidentifiable, give a concise actionable rejection message.',
    },
    itemType: {
      type: Type.STRING,
      description:
        'Primary produce name in Title Case (e.g., Apple, Banana, Tomato, Mango, Potato, Orange, Strawberry, Bell Pepper, Cucumber, Grapes, Avocado, Carrot).',
    },
    freshnessClass: {
      type: Type.STRING,
      enum: ['Fresh', 'Ripe', 'Overripe', 'Rotten'],
    },
    qualityGrade: {
      type: Type.STRING,
      enum: ['A', 'B', 'C', 'Reject'],
    },
    visualScore: {
      type: Type.INTEGER,
      description: 'Visual quality score from 0 (completely rotten) to 100 (peak fresh grade A).',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Model classification confidence percentage from 0 to 100.',
    },
    defects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ['bruises', 'dark_spots', 'mold', 'wrinkles', 'cuts', 'insect_damage'],
          },
          severity: {
            type: Type.STRING,
            enum: ['Low', 'Moderate', 'Severe'],
          },
          confidence: {
            type: Type.NUMBER,
          },
          description: {
            type: Type.STRING,
          },
          bbox: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description:
              'Bounding box [ymin, xmin, ymax, xmax] normalized 0 to 1000 on the primary image.',
          },
        },
        required: ['type', 'severity', 'confidence', 'description', 'bbox'],
      },
    },
    colorAnalysis: {
      type: Type.OBJECT,
      properties: {
        dominantColor: { type: Type.STRING },
        dominantHex: { type: Type.STRING },
        ripenessIndex: { type: Type.INTEGER },
        hueAvg: { type: Type.INTEGER },
        saturationAvg: { type: Type.INTEGER },
        valueAvg: { type: Type.INTEGER },
        hsvSummary: { type: Type.STRING },
      },
      required: [
        'dominantColor',
        'dominantHex',
        'ripenessIndex',
        'hueAvg',
        'saturationAvg',
        'valueAvg',
        'hsvSummary',
      ],
    },
    estimatedShelfLifeDays: {
      type: Type.INTEGER,
      description: 'Estimated remaining edible shelf life in days (0 if rotten/discard).',
    },
    storageRecommendation: {
      type: Type.STRING,
      enum: ['Refrigerate', 'Room Temperature', 'Consume Today', 'Discard'],
    },
    summaryNotes: {
      type: Type.STRING,
      description: 'Concise 1-2 sentence agronomic inspection summary.',
    },
  },
  required: [
    'isProducePresent',
    'itemType',
    'freshnessClass',
    'qualityGrade',
    'visualScore',
    'confidence',
    'defects',
    'colorAnalysis',
    'estimatedShelfLifeDays',
    'storageRecommendation',
    'summaryNotes',
  ],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractReadableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return String(parsed.error.message);
  } catch {
    // Raw message is plain text
  }
  return raw;
}

function isTransientError(err: unknown): boolean {
  const msg = extractReadableError(err).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('500') ||
    msg.includes('internal') ||
    msg.includes('timeout') ||
    msg.includes('econnreset')
  );
}

export async function analyzeProduceImages(
  input: VisionInspectionInput
): Promise<VisionInspectionOutput> {
  const ai = getGeminiClient();
  const started = Date.now();

  const imageParts = input.images.map((img) => ({
    inlineData: {
      mimeType: img.mimeType,
      data: img.base64Data,
    },
  }));

  const hsvContext = input.clientHsvHint
    ? `Client OpenCV-style HSV pre-analysis hint: dominantHex=${input.clientHsvHint.dominantHex ?? 'unknown'}, hue=${input.clientHsvHint.hueAvg ?? 0}, sat=${input.clientHsvHint.saturationAvg ?? 0}%, val=${input.clientHsvHint.valueAvg ?? 0}%.`
    : '';

  const prompt = [
    `Inspect the attached produce photograph(s) (${input.images.length} angle${input.images.length > 1 ? 's' : ''}) as a post-harvest agricultural quality control inspector.`,
    `Known produce taxonomy classes include: ${input.supportedProduceClasses.join(', ')} (or identify the exact fruit/vegetable if outside this list).`,
    hsvContext,
    'Rules:',
    '1. First verify whether a real fruit or vegetable is clearly present. If the image contains no fruit or vegetable (e.g., blank wall, person, laptop, non-food object), set isProducePresent=false and provide a clear rejectionReason such as "No fruit or vegetable detected in the frame, please retake."',
    '2. Carefully inspect skin turgor, color uniformity, ripeness stage, bruises, dark spots, mold/fungal lesions, dehydration wrinkles, cuts/cracks, and insect damage across all provided angles.',
    '3. For every visible defect on the primary (first) image, return accurate normalized [ymin, xmin, ymax, xmax] bounding boxes in 0..1000 scale.',
    '4. Be strictly realistic with visualScore (0-100), qualityGrade (A >= 82, B >= 65, C >= 42, Reject < 42), estimatedShelfLifeDays, and storageRecommendation.',
  ].join('\n');

  const attempts: Array<{ model: string; useLowThinking: boolean; backoffMs: number }> = [
    { model: 'gemini-4-hydrogen', useLowThinking: true, backoffMs: 0 },
    { model: 'gemini-4-hydrogen', useLowThinking: true, backoffMs: 900 },
    { model: 'gemini-3.1-flash-lite', useLowThinking: false, backoffMs: 400 },
    { model: 'gemini-3.1-flash-lite', useLowThinking: false, backoffMs: 1200 },
  ];

  let rawText = '';
  let lastError: unknown = null;

  for (const attempt of attempts) {
    if (attempt.backoffMs > 0) {
      await sleep(attempt.backoffMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: {
          parts: [...imageParts, { text: prompt }],
        },
        config: {
          systemInstruction:
            'You are FreshScan AI, an objective post-harvest produce optical grading engine. Return strictly calibrated JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: INSPECTION_SCHEMA,
          ...(attempt.useLowThinking
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      });
      rawText = (response.text ?? '').trim();
      if (rawText) {
        lastError = null;
        break;
      }
    } catch (err) {
      lastError = err;
      if (!isTransientError(err)) {
        break;
      }
    }
  }

  if (lastError || !rawText) {
    const cleanMsg = lastError
      ? extractReadableError(lastError)
      : 'Vision model returned an empty response.';
    throw new Error(cleanMsg);
  }

  const elapsed = Date.now() - started;
  const parsed = JSON.parse(rawText);

  const normalizedDefects: DefectBox[] = Array.isArray(parsed.defects)
    ? parsed.defects.map((d: Record<string, unknown>) => {
        const rawBox = Array.isArray(d.bbox) ? d.bbox.map(Number) : [250, 250, 550, 550];
        const bbox: [number, number, number, number] = [
          Math.max(0, Math.min(990, rawBox[0] ?? 250)),
          Math.max(0, Math.min(990, rawBox[1] ?? 250)),
          Math.max(10, Math.min(1000, rawBox[2] ?? 550)),
          Math.max(10, Math.min(1000, rawBox[3] ?? 550)),
        ];
        return {
          id: `def-${crypto.randomUUID().slice(0, 6)}`,
          type: (d.type as DefectBox['type']) ?? 'dark_spots',
          severity: (d.severity as DefectBox['severity']) ?? 'Moderate',
          confidence: Math.round(Number(d.confidence ?? 88)),
          description: String(d.description ?? 'Surface anomaly detected'),
          bbox,
        };
      })
    : [];

  return {
    isProducePresent: Boolean(parsed.isProducePresent),
    rejectionReason: parsed.rejectionReason ? String(parsed.rejectionReason) : undefined,
    itemType: String(parsed.itemType ?? 'Unknown Produce'),
    freshnessClass: (parsed.freshnessClass as FreshnessClass) ?? 'Ripe',
    qualityGrade: (parsed.qualityGrade as QualityGrade) ?? 'B',
    visualScore: Math.max(0, Math.min(100, Math.round(Number(parsed.visualScore ?? 75)))),
    confidence: Math.max(0, Math.min(100, Number(Number(parsed.confidence ?? 90).toFixed(1)))),
    defects: normalizedDefects,
    colorAnalysis: {
      dominantColor: String(parsed.colorAnalysis?.dominantColor ?? 'Natural Hue'),
      dominantHex: String(
        parsed.colorAnalysis?.dominantHex ?? input.clientHsvHint?.dominantHex ?? '#4D7C0F'
      ),
      ripenessIndex: Math.max(
        0,
        Math.min(100, Math.round(Number(parsed.colorAnalysis?.ripenessIndex ?? 75)))
      ),
      hueAvg: Math.round(
        Number(parsed.colorAnalysis?.hueAvg ?? input.clientHsvHint?.hueAvg ?? 45)
      ),
      saturationAvg: Math.round(
        Number(parsed.colorAnalysis?.saturationAvg ?? input.clientHsvHint?.saturationAvg ?? 65)
      ),
      valueAvg: Math.round(
        Number(parsed.colorAnalysis?.valueAvg ?? input.clientHsvHint?.valueAvg ?? 70)
      ),
      hsvSummary: String(parsed.colorAnalysis?.hsvSummary ?? 'Balanced epidermal pigment profile.'),
    },
    estimatedShelfLifeDays: Math.max(0, Math.round(Number(parsed.estimatedShelfLifeDays ?? 3))),
    storageRecommendation:
      (parsed.storageRecommendation as StorageRecommendation) ?? 'Refrigerate',
    summaryNotes: String(parsed.summaryNotes ?? 'Inspection complete.'),
    inferenceTimeMs: elapsed,
  };
}
