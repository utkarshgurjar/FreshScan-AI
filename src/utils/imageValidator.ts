import type { ColorAnalysis, OpticalValidationMetrics } from '../types/freshscan';

export interface ClientImagePrecheckResult {
  metrics: OpticalValidationMetrics;
  hsvHint: Partial<ColorAnalysis>;
  errorMessage?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : Math.round((d / max) * 100);
  const v = Math.round(max * 100);
  return [h, s, v];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Mirrors OpenCV/JavaCV pre-validation directly in the browser before uploading:
 * 1. File type & 10 MB size check
 * 2. Mean luminance brightness check (detects dark / overexposed frames)
 * 3. 3x3 Laplacian variance sharpness check (detects motion blur)
 * 4. Central-ROI HSV color histogram extraction
 */
export async function validateProduceImage(file: File | Blob, fileName = 'capture.jpg'): Promise<ClientImagePrecheckResult> {
  const mime = file.type || 'image/jpeg';
  if (!ALLOWED_MIME.has(mime)) {
    return {
      metrics: {
        width: 0,
        height: 0,
        fileSizeBytes: file.size,
        sharpnessScore: 0,
        brightnessScore: 0,
        passed: false,
        warnings: ['Unsupported file format'],
      },
      hsvHint: {},
      errorMessage: `Unsupported file type (${fileName}). Please upload a JPG, PNG, or WebP image.`,
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      metrics: {
        width: 0,
        height: 0,
        fileSizeBytes: file.size,
        sharpnessScore: 0,
        brightnessScore: 0,
        passed: false,
        warnings: ['File exceeds 10 MB'],
      },
      hsvHint: {},
      errorMessage: 'Image exceeds the 10 MB limit. Please compress or retake the photo.',
    };
  }

  const bitmap = await createImageBitmap(file);
  const origW = bitmap.width;
  const origH = bitmap.height;

  // Downscale to 224x224 for deterministic Laplacian & HSV computation (matches MobileNetV2 input)
  const targetSize = 224;
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.drawImage(bitmap, 0, 0, targetSize, targetSize);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, targetSize, targetSize);
  const gray = new Float32Array(targetSize * targetSize);

  let lumSum = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let roiCount = 0;
  let hSum = 0;
  let sSum = 0;
  let vSum = 0;

  const roiMin = Math.floor(targetSize * 0.25);
  const roiMax = Math.floor(targetSize * 0.75);

  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const idx = (y * targetSize + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[y * targetSize + x] = lum;
      lumSum += lum;

      if (x >= roiMin && x <= roiMax && y >= roiMin && y <= roiMax) {
        const [h, s, v] = rgbToHsv(r, g, b);
        // Emphasize chromatic subject pixels over neutral studio background
        if (s >= 18) {
          rSum += r;
          gSum += g;
          bSum += b;
          hSum += h;
          sSum += s;
          vSum += v;
          roiCount++;
        }
      }
    }
  }

  const pixelCount = targetSize * targetSize;
  const brightnessScore = Math.round(lumSum / pixelCount);

  // Discrete 3x3 Laplacian variance for blur estimation
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  for (let y = 1; y < targetSize - 1; y++) {
    for (let x = 1; x < targetSize - 1; x++) {
      const c = y * targetSize + x;
      const lap =
        gray[c - targetSize] +
        gray[c + targetSize] +
        gray[c - 1] +
        gray[c + 1] -
        4 * gray[c];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
    }
  }
  const lapMean = lapSum / lapCount;
  const sharpnessScore = Math.round(lapSqSum / lapCount - lapMean * lapMean);

  const warnings: string[] = [];
  let errorMessage: string | undefined;

  if (brightnessScore < 38) {
    errorMessage = 'Image too dark, please improve lighting and retake.';
    warnings.push('Low-light exposure detected');
  } else if (brightnessScore > 246) {
    errorMessage = 'Image is overexposed / washed out, please reduce glare and retake.';
    warnings.push('Overexposed highlights');
  } else if (sharpnessScore < 28) {
    errorMessage = 'Image is too blurry (low sharpness variance), please hold steady and retake.';
    warnings.push('Motion blur detected');
  }

  const hsvHint: Partial<ColorAnalysis> =
    roiCount > 25
      ? {
          dominantHex: rgbToHex(rSum / roiCount, gSum / roiCount, bSum / roiCount),
          hueAvg: Math.round(hSum / roiCount),
          saturationAvg: Math.round(sSum / roiCount),
          valueAvg: Math.round(vSum / roiCount),
        }
      : {
          dominantHex: '#64748B',
          hueAvg: 0,
          saturationAvg: 12,
          valueAvg: Math.round((brightnessScore / 255) * 100),
        };

  return {
    metrics: {
      width: origW,
      height: origH,
      fileSizeBytes: file.size,
      sharpnessScore,
      brightnessScore,
      passed: !errorMessage,
      warnings,
    },
    hsvHint,
    errorMessage,
  };
}

/**
 * Downscales high-resolution camera/phone photos to <= 1024px JPEG (~80-160 KB)
 * before multipart upload so 4-angle inspections stay fast and well below proxy limits.
 */
export async function compressImageForUpload(
  file: File,
  maxDimension = 1024,
  quality = 0.84
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const targetW = Math.max(1, Math.round(bitmap.width * scale));
  const targetH = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'angle';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

