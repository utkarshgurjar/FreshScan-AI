import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { hashPassword, store, verifyPassword } from './server/store.ts';
import { analyzeProduceImages } from './server/vision.ts';
import {
  buildBatchCsv,
  buildBatchPdfBuffer,
  buildRetrainingDatasetCsv,
  buildScanCsv,
  buildScanPdfBuffer,
} from './server/pdfReport.ts';
import type {
  FreshnessClass,
  ScanRecord,
  SensorReadingRecord,
  SensorSnapshot,
  UserRole,
} from './src/types/freshscan.ts';

dotenv.config();

const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Ephemeral fallback signing secret if JWT_SECRET is not provided in environment
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_TTL_SEC = 3600 * 4;
const REFRESH_TTL_SEC = 86400 * 7;

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Explicit allowlist for built-in studio lab produce samples (prevents arbitrary file reads)
const ALLOWED_SAMPLE_PATHS = new Set<string>([
  '/src/assets/images/sample_apple_fresh_1795378597367.jpg',
  '/src/assets/images/sample_banana_overripe_1795378626365.jpg',
  '/src/assets/images/sample_tomato_fresh_1795378597486.jpg',
  '/src/assets/images/sample_mango_defective_1795378597053.jpg',
]);

// --- Minimal Self-Contained HS256 JWT Utilities ---
interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

function base64UrlEncode(data: Buffer | string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>, ttlSec: number): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = { ...payload, iat: now, exp: now + ttlSec };
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${sig}`;
}

function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest()
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(base64UrlDecode(body)) as JwtPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  user?: JwtPayload;
}

function extractBearerUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const payload = verifyToken(auth.slice(7).trim());
    if (payload && payload.type === 'access') {
      req.user = payload;
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please sign in to perform this action.',
    });
    return;
  }
  next();
}

function requireRoles(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Requires one of the following roles: ${roles.join(', ')}.`,
      });
      return;
    }
    next();
  };
}

// --- Sliding-Window Rate Limiter ---
const rateBuckets = new Map<string, number[]>();
function rateLimiter(maxReq = 120, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const hits = (rateBuckets.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= maxReq) {
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please wait a moment and try again.',
      });
      return;
    }
    hits.push(now);
    rateBuckets.set(ip, hits);
    next();
  };
}

// --- Magic Byte Image Sniffer (prevents spoofed MIME uploads) ---
function sniffImageMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function saveUploadedImage(buf: Buffer, mime: 'image/jpeg' | 'image/png' | 'image/webp'): string {
  const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
  const fileName = `scan-${crypto.randomUUID()}${ext}`;
  const target = path.resolve(UPLOADS_DIR, fileName);
  if (!target.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error('Invalid upload target path');
  }
  fs.writeFileSync(target, buf);
  return `/uploads/${fileName}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per image
    files: 4,
  },
});

function safeParseJson<T>(raw: unknown): T | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Restrict CORS to same origin / configured APP_URL (no wildcard on authenticated routes)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigin = process.env.APP_URL;
    if (origin && allowedOrigin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', rateLimiter(180, 60_000));
  app.use('/api', extractBearerUser);
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          store.persist();
        }
      });
    }
    next();
  });

  // Serve validated user-uploaded scan thumbnails safely
  app.use('/uploads', express.static(UPLOADS_DIR, { dotfiles: 'deny', index: false }));

  // =========================================================================
  // 1. AUTHENTICATION & ROLE MANAGEMENT (/api/auth/*)
  // =========================================================================

  app.get('/api/auth/admin-status', (_req, res) => {
    const envConfigured = Boolean(process.env.ADMIN_PASSCODE?.trim());
    res.json({
      envConfigured,
      claimed: Boolean(store.adminClaimedHash),
      adminConfigured: envConfigured || Boolean(store.adminClaimedHash),
    });
  });

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'FreshScan AI REST API',
        version: '1.0.0',
        description:
          'Camera-based Fruit & Vegetable Quality Checker API supporting multi-angle image inspection, defect localization, thermal & gas sensor fusion, batch reports (PDF/CSV), model feedback, and RBAC administration.',
      },
      paths: {
        '/api/auth/register': { post: { summary: 'Register USER or INSPECTOR account' } },
        '/api/auth/login': { post: { summary: 'Authenticate and receive JWT access & refresh tokens' } },
        '/api/auth/refresh': { post: { summary: 'Rotate access token using refresh token' } },
        '/api/scans': {
          post: { summary: 'Analyze 1-4 multipart produce images with optional thermal/gas sensor snapshot' },
          get: { summary: 'Search and filter scan history by item, grade, batch, date, or keyword' },
        },
        '/api/scans/{id}': {
          get: { summary: 'Get detailed scan record with defects and color metrics' },
          delete: { summary: 'Delete scan (Owner, Inspector, or Admin)' },
        },
        '/api/scans/{id}/report': {
          get: { summary: 'Download individual scan inspection certificate (?format=pdf|csv)' },
        },
        '/api/scans/{id}/feedback': {
          post: { summary: 'Submit ground-truth verification or label correction to retraining dataset' },
        },
        '/api/batches': {
          post: { summary: 'Create a produce storage batch lot' },
          get: { summary: 'List batches with % fresh, % rotten, and average quality score' },
        },
        '/api/batches/{id}': { get: { summary: 'Get batch summary, scans, and sensor readings' } },
        '/api/batches/{id}/report': {
          get: { summary: 'Export batch quality audit report (?format=pdf|csv)' },
        },
        '/api/sensors/readings': {
          post: { summary: 'Ingest ESP32 gas (ethylene, ammonia, CO2), temp/humidity & thermal matrix packet' },
        },
        '/api/sensors/batch/{id}': { get: { summary: 'Get time-series telemetry and alerts for a batch' } },
        '/api/dashboard/summary': {
          get: { summary: 'Get dashboard KPIs, daily scans, grade distribution, top defects, and trends' },
        },
        '/api/admin/users': { get: { summary: 'List users (ADMIN)' } },
        '/api/admin/produce-types': {
          get: { summary: 'List configured produce classes (ADMIN)' },
          post: { summary: 'Add new produce class with grade thresholds (ADMIN)' },
        },
        '/api/admin/settings': { put: { summary: 'Update spoilage fusion weights & alert thresholds (ADMIN)' } },
        '/api/admin/dataset/export': {
          get: { summary: 'Export feedback retraining dataset (?format=csv|json) (ADMIN)' },
        },
      },
    });
  });

  app.post('/api/auth/claim-admin', (req, res) => {
    const { passcode, email, name } = req.body ?? {};
    if (typeof passcode !== 'string' || passcode.trim().length < 6) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Admin password must be at least 6 characters.',
      });
      return;
    }

    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode) {
      const a = Buffer.from(passcode);
      const b = Buffer.from(envPasscode);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid administrator passcode.',
        });
        return;
      }
    } else if (store.adminClaimedHash) {
      if (!verifyPassword(passcode, store.adminClaimedHash.hash, store.adminClaimedHash.salt)) {
        res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid administrator password.',
        });
        return;
      }
    } else {
      // One-time atomic first-run bootstrap claim
      store.adminClaimedHash = hashPassword(passcode);
    }

    const adminEmail =
      typeof email === 'string' && email.includes('@')
        ? email.trim().toLowerCase()
        : 'admin@freshscan.local';
    const adminName =
      typeof name === 'string' && name.trim().length >= 2
        ? name.trim()
        : 'Lead QA Administrator';

    let adminUser = store.users.find((u) => u.email === adminEmail);
    if (!adminUser) {
      const pw = hashPassword(passcode);
      adminUser = {
        id: `usr-admin-${crypto.randomUUID().slice(0, 6)}`,
        name: adminName,
        email: adminEmail,
        role: 'ADMIN',
        createdAt: new Date().toISOString(),
        passwordHash: pw.hash,
        passwordSalt: pw.salt,
      };
      store.users.unshift(adminUser);
    } else {
      adminUser.role = 'ADMIN';
    }

    const accessToken = signToken(
      {
        sub: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
        type: 'access',
      },
      ACCESS_TTL_SEC
    );
    const refreshToken = signToken(
      {
        sub: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
        type: 'refresh',
      },
      REFRESH_TTL_SEC
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        createdAt: adminUser.createdAt,
      },
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, role } = req.body ?? {};
    if (
      typeof name !== 'string' ||
      name.trim().length < 2 ||
      typeof email !== 'string' ||
      !email.includes('@') ||
      typeof password !== 'string' ||
      password.length < 6
    ) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Provide a valid name, email, and password (minimum 6 characters).',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (store.users.some((u) => u.email === cleanEmail)) {
      res.status(409).json({
        error: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
      return;
    }

    // Never allow self-registration directly to ADMIN
    const assignedRole: UserRole = role === 'INSPECTOR' ? 'INSPECTOR' : 'USER';
    const pw = hashPassword(password);
    const user = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      email: cleanEmail,
      role: assignedRole,
      createdAt: new Date().toISOString(),
      passwordHash: pw.hash,
      passwordSalt: pw.salt,
    };
    store.users.push(user);

    const accessToken = signToken(
      { sub: user.id, email: user.email, name: user.name, role: user.role, type: 'access' },
      ACCESS_TTL_SEC
    );
    const refreshToken = signToken(
      { sub: user.id, email: user.email, name: user.name, role: user.role, type: 'refresh' },
      REFRESH_TTL_SEC
    );

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email and password required.' });
      return;
    }

    const user = store.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
      return;
    }

    const accessToken = signToken(
      { sub: user.id, email: user.email, name: user.name, role: user.role, type: 'access' },
      ACCESS_TTL_SEC
    );
    const refreshToken = signToken(
      { sub: user.id, email: user.email, name: user.name, role: user.role, type: 'refresh' },
      REFRESH_TTL_SEC
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  });

  app.post('/api/auth/refresh', (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'refreshToken is required.' });
      return;
    }
    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== 'refresh') {
      res.status(401).json({ error: 'INVALID_TOKEN', message: 'Refresh token is invalid or expired.' });
      return;
    }
    const user = store.users.find((u) => u.id === payload.sub);
    if (!user) {
      res.status(401).json({ error: 'USER_NOT_FOUND', message: 'Account no longer exists.' });
      return;
    }
    const accessToken = signToken(
      { sub: user.id, email: user.email, name: user.name, role: user.role, type: 'access' },
      ACCESS_TTL_SEC
    );
    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = store.users.find((u) => u.id === req.user!.sub);
    if (!user) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' });
      return;
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    });
  });

  // =========================================================================
  // 2. PRODUCE SCANNING & AI QUALITY ANALYSIS (/api/scans/*)
  // =========================================================================

  app.post('/api/scans', upload.array('images', 4), async (req: AuthedRequest, res) => {
    try {
      const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
      const sampleImagePath =
        typeof req.body?.sampleImagePath === 'string' ? req.body.sampleImagePath : undefined;

      const visionInputs: Array<{ mimeType: string; base64Data: string }> = [];
      const storedUrls: string[] = [];

      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          const sniffed = sniffImageMime(file.buffer);
          if (!sniffed) {
            res.status(400).json({
              error: 'INVALID_IMAGE_FORMAT',
              message:
                'Unsupported or corrupted image file. Please upload a valid JPG, PNG, or WebP photo (max 10 MB).',
            });
            return;
          }
          const url = saveUploadedImage(file.buffer, sniffed);
          storedUrls.push(url);
          visionInputs.push({
            mimeType: sniffed,
            base64Data: file.buffer.toString('base64'),
          });
        }
      } else if (sampleImagePath && ALLOWED_SAMPLE_PATHS.has(sampleImagePath)) {
        const diskPath = path.resolve(process.cwd(), sampleImagePath.slice(1));
        const assetsRoot = path.resolve(process.cwd(), 'src', 'assets', 'images');
        if (!diskPath.startsWith(assetsRoot + path.sep) || !fs.existsSync(diskPath)) {
          res.status(404).json({
            error: 'SAMPLE_NOT_FOUND',
            message: 'Requested studio sample image was not found.',
          });
          return;
        }
        const buf = fs.readFileSync(diskPath);
        storedUrls.push(sampleImagePath);
        visionInputs.push({
          mimeType: 'image/jpeg',
          base64Data: buf.toString('base64'),
        });
      } else {
        res.status(400).json({
          error: 'NO_IMAGE_PROVIDED',
          message: 'Please capture a photo or upload at least one JPG/PNG produce image.',
        });
        return;
      }

      const batchId =
        typeof req.body?.batchId === 'string' && req.body.batchId.trim()
          ? req.body.batchId.trim()
          : null;

      const sensorSnapshot = safeParseJson<SensorSnapshot>(req.body?.sensorData);
      const clientHsvHint = safeParseJson<Record<string, unknown>>(req.body?.hsvMetrics);
      const opticalMetrics = safeParseJson<ScanRecord['opticalMetrics']>(req.body?.opticalMetrics);

      const analysis = await analyzeProduceImages({
        images: visionInputs,
        clientHsvHint,
        supportedProduceClasses: store.produceTypes.map((p) => p.name),
      });

      if (!analysis.isProducePresent) {
        res.status(422).json({
          error: 'NO_PRODUCE_DETECTED',
          message:
            analysis.rejectionReason ||
            'No fruit or vegetable detected in the frame. Please center the produce and retake.',
        });
        return;
      }

      const fused = store.fuseVisualAndSensorScore(analysis.visualScore, sensorSnapshot);

      const scan: ScanRecord = {
        id: `scn-${crypto.randomUUID().slice(0, 8)}`,
        batchId,
        userId: req.user?.sub ?? 'guest-inspector',
        inspectorName: req.user?.name ?? 'Guest Inspector',
        createdAt: new Date().toISOString(),
        imageUrl: storedUrls[0],
        angleImageUrls: storedUrls,
        itemType: analysis.itemType,
        freshnessClass: analysis.freshnessClass,
        qualityGrade: sensorSnapshot ? fused.qualityGrade : analysis.qualityGrade,
        visualScore: analysis.visualScore,
        qualityScore: fused.finalQualityScore,
        spoilageIndex: fused.spoilageIndex,
        confidence: analysis.confidence,
        defects: analysis.defects,
        colorAnalysis: analysis.colorAnalysis,
        estimatedShelfLifeDays:
          sensorSnapshot && fused.spoilageIndex > 70
            ? Math.min(analysis.estimatedShelfLifeDays, 1)
            : analysis.estimatedShelfLifeDays,
        storageRecommendation:
          fused.qualityGrade === 'Reject' ? 'Discard' : analysis.storageRecommendation,
        summaryNotes: analysis.summaryNotes,
        inferenceTimeMs: analysis.inferenceTimeMs,
        usedSensorFusion: Boolean(sensorSnapshot),
        sensorSnapshot,
        opticalMetrics,
      };

      store.scans.unshift(scan);

      // If sensor snapshot was attached alongside a batch scan, also record telemetry & check alerts
      if (sensorSnapshot && batchId) {
        const reading: SensorReadingRecord = {
          id: `sr-${crypto.randomUUID().slice(0, 8)}`,
          batchId,
          deviceId: 'SCAN-ATTACHED-SENSOR',
          recordedAt: scan.createdAt,
          temperatureC: Number(sensorSnapshot.temperatureC),
          humidityPct: Number(sensorSnapshot.humidityPct),
          ethylenePpm: Number(sensorSnapshot.ethylenePpm),
          ammoniaPpm: Number(sensorSnapshot.ammoniaPpm),
          co2Ppm: Number(sensorSnapshot.co2Ppm),
          thermalMaxC: Number(sensorSnapshot.thermalMaxC ?? sensorSnapshot.temperatureC + 1.5),
          thermalMinC: Number(sensorSnapshot.thermalMinC ?? sensorSnapshot.temperatureC - 0.5),
          thermalMatrix:
            sensorSnapshot.thermalMatrix ??
            Array.from({ length: 8 }, () =>
              Array.from({ length: 8 }, () => Number(sensorSnapshot.temperatureC.toFixed(1)))
            ),
          computedSpoilageRisk: store.computeSensorSpoilageRisk(sensorSnapshot),
        };
        store.sensorReadings.push(reading);
        store.evaluateThresholdsAndRaiseAlerts(reading);
      }

      res.status(201).json(scan);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze produce image.';
      res.status(502).json({
        error: 'VISION_INFERENCE_ERROR',
        message,
      });
    }
  });

  app.get('/api/scans', (req, res) => {
    const { item, grade, batchId, search, fromDate, toDate } = req.query;
    let results = [...store.scans];

    if (typeof item === 'string' && item && item !== 'ALL') {
      results = results.filter((s) => s.itemType.toLowerCase() === item.toLowerCase());
    }
    if (typeof grade === 'string' && grade && grade !== 'ALL') {
      results = results.filter((s) => s.qualityGrade === grade);
    }
    if (typeof batchId === 'string' && batchId && batchId !== 'ALL') {
      results = results.filter((s) => s.batchId === batchId);
    }
    if (typeof fromDate === 'string' && fromDate) {
      results = results.filter((s) => s.createdAt.slice(0, 10) >= fromDate);
    }
    if (typeof toDate === 'string' && toDate) {
      results = results.filter((s) => s.createdAt.slice(0, 10) <= toDate);
    }
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(
        (s) =>
          s.itemType.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.freshnessClass.toLowerCase().includes(q) ||
          s.summaryNotes.toLowerCase().includes(q)
      );
    }

    res.json(results);
  });

  app.get('/api/scans/:id', (req, res) => {
    const scan = store.scans.find((s) => s.id === req.params.id);
    if (!scan) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Scan record not found.' });
      return;
    }
    res.json(scan);
  });

  app.get('/api/scans/:id/report', async (req, res) => {
    const scan = store.scans.find((s) => s.id === req.params.id);
    if (!scan) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Scan record not found.' });
      return;
    }
    const format = String(req.query.format ?? 'pdf').toLowerCase();
    if (format === 'csv') {
      const csv = buildScanCsv(scan);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${scan.id}-report.csv"`);
      res.send(csv);
      return;
    }
    const pdfBuf = await buildScanPdfBuffer(scan);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${scan.id}-certificate.pdf"`);
    res.send(pdfBuf);
  });

  app.delete('/api/scans/:id', requireAuth, (req: AuthedRequest, res) => {
    const idx = store.scans.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Scan record not found.' });
      return;
    }
    const scan = store.scans[idx];
    const isOwner = scan.userId === req.user!.sub;
    const isPrivileged = req.user!.role === 'ADMIN' || req.user!.role === 'INSPECTOR';
    if (!isOwner && !isPrivileged) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only the scan owner, an Inspector, or an Admin can delete this scan.',
      });
      return;
    }
    store.scans.splice(idx, 1);
    res.status(204).end();
  });

  app.post('/api/scans/:id/feedback', (req: AuthedRequest, res) => {
    const scan = store.scans.find((s) => s.id === req.params.id);
    if (!scan) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Scan record not found.' });
      return;
    }
    const { isCorrect, correctedItem, correctedFreshness, notes } = req.body ?? {};
    if (typeof isCorrect !== 'boolean') {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'isCorrect boolean is required.',
      });
      return;
    }

    const feedback = {
      id: `fb-${crypto.randomUUID().slice(0, 8)}`,
      scanId: scan.id,
      userId: req.user?.sub ?? 'guest-inspector',
      isCorrect,
      predictedItem: scan.itemType,
      correctedItem:
        !isCorrect && typeof correctedItem === 'string' && correctedItem.trim()
          ? correctedItem.trim()
          : scan.itemType,
      predictedFreshness: scan.freshnessClass,
      correctedFreshness:
        !isCorrect &&
        ['Fresh', 'Ripe', 'Overripe', 'Rotten'].includes(String(correctedFreshness))
          ? (correctedFreshness as FreshnessClass)
          : scan.freshnessClass,
      notes: typeof notes === 'string' ? notes.trim().slice(0, 500) : '',
      imageUrl: scan.imageUrl,
      createdAt: new Date().toISOString(),
    };

    store.feedbacks.unshift(feedback);
    scan.feedback = feedback;
    res.status(201).json(feedback);
  });

  // =========================================================================
  // 3. BATCHES & PDF/CSV REPORTS (/api/batches/*)
  // =========================================================================

  app.get('/api/batches', (_req, res) => {
    res.json(store.getBatchSummaries());
  });

  app.post('/api/batches', (req: AuthedRequest, res) => {
    const { supplier, produceCategory, receivedDate, storageLocation, notes } = req.body ?? {};
    if (
      typeof supplier !== 'string' ||
      supplier.trim().length < 2 ||
      typeof storageLocation !== 'string' ||
      storageLocation.trim().length < 2
    ) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Supplier and storage location are required.',
      });
      return;
    }

    const nextNum = 41 + store.batches.length;
    const batch = {
      id: `batch-${crypto.randomUUID().slice(0, 6)}`,
      code: `LOT-2026-0${nextNum}`,
      supplier: supplier.trim(),
      produceCategory:
        typeof produceCategory === 'string' && produceCategory.trim()
          ? produceCategory.trim()
          : 'Mixed Produce',
      receivedDate:
        typeof receivedDate === 'string' && receivedDate
          ? receivedDate
          : new Date().toISOString().slice(0, 10),
      storageLocation: storageLocation.trim(),
      createdBy: req.user?.name ?? 'Guest Inspector',
      createdAt: new Date().toISOString(),
      notes: typeof notes === 'string' ? notes.trim().slice(0, 400) : '',
    };

    store.batches.unshift(batch);
    const summary = store.getBatchSummaries().find((b) => b.id === batch.id);
    res.status(201).json(summary ?? batch);
  });

  app.get('/api/batches/:id', (req, res) => {
    const batch = store.getBatchSummaries().find((b) => b.id === req.params.id);
    if (!batch) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Batch not found.' });
      return;
    }
    const scans = store.scans.filter((s) => s.batchId === batch.id);
    const readings = store.sensorReadings
      .filter((r) => r.batchId === batch.id)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    res.json({ batch, scans, readings });
  });

  app.get('/api/batches/:id/report', async (req, res) => {
    const batch = store.getBatchSummaries().find((b) => b.id === req.params.id);
    if (!batch) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Batch not found.' });
      return;
    }
    const format = String(req.query.format ?? 'pdf').toLowerCase();
    const scans = store.scans.filter((s) => s.batchId === batch.id);
    const readings = store.sensorReadings
      .filter((r) => r.batchId === batch.id)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

    if (format === 'csv') {
      const csv = buildBatchCsv(batch, scans);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${batch.code}-report.csv"`);
      res.send(csv);
      return;
    }

    const pdfBuf = await buildBatchPdfBuffer(batch, scans, readings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${batch.code}-report.pdf"`);
    res.send(pdfBuf);
  });

  // =========================================================================
  // 4. THERMAL & GAS IOT SENSORS (/api/sensors/*)
  // =========================================================================

  app.post('/api/sensors/readings', (req, res) => {
    const {
      batchId,
      deviceId,
      temperatureC,
      humidityPct,
      ethylenePpm,
      ammoniaPpm,
      co2Ppm,
      thermalMaxC,
      thermalMinC,
      thermalMatrix,
    } = req.body ?? {};

    if (
      typeof batchId !== 'string' ||
      !store.batches.some((b) => b.id === batchId) ||
      typeof temperatureC !== 'number' ||
      typeof humidityPct !== 'number' ||
      typeof ethylenePpm !== 'number' ||
      typeof ammoniaPpm !== 'number' ||
      typeof co2Ppm !== 'number'
    ) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message:
          'Valid batchId and numeric temperatureC, humidityPct, ethylenePpm, ammoniaPpm, co2Ppm are required.',
      });
      return;
    }

    const maxT = typeof thermalMaxC === 'number' ? thermalMaxC : Number((temperatureC + 2.4).toFixed(1));
    const minT = typeof thermalMinC === 'number' ? thermalMinC : Number((temperatureC - 0.5).toFixed(1));

    const matrix: number[][] =
      Array.isArray(thermalMatrix) && thermalMatrix.length === 8
        ? thermalMatrix
        : Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 8 }, (__, c) => {
              const dist = Math.hypot(r - 3.2, c - 4.5);
              const bump = Math.max(0, 1 - dist / 4.2) * Math.max(0.5, maxT - temperatureC);
              return Number((temperatureC + bump).toFixed(1));
            })
          );

    const reading: SensorReadingRecord = {
      id: `sr-${crypto.randomUUID().slice(0, 8)}`,
      batchId,
      deviceId: typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : 'ESP32-REST-NODE',
      recordedAt: new Date().toISOString(),
      temperatureC: Number(temperatureC.toFixed(1)),
      humidityPct: Number(humidityPct.toFixed(1)),
      ethylenePpm: Number(ethylenePpm.toFixed(1)),
      ammoniaPpm: Number(ammoniaPpm.toFixed(1)),
      co2Ppm: Math.round(co2Ppm),
      thermalMaxC: Number(maxT.toFixed(1)),
      thermalMinC: Number(minT.toFixed(1)),
      thermalMatrix: matrix,
      computedSpoilageRisk: store.computeSensorSpoilageRisk({
        temperatureC,
        humidityPct,
        ethylenePpm,
        ammoniaPpm,
        co2Ppm,
        thermalMaxC: maxT,
      }),
    };

    store.sensorReadings.push(reading);
    const alertsRaised = store.evaluateThresholdsAndRaiseAlerts(reading);

    res.status(201).json({ reading, alertsRaised });
  });

  app.get('/api/sensors/batch/:id', (req, res) => {
    const readings = store.sensorReadings
      .filter((r) => r.batchId === req.params.id)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const alerts = store.alerts.filter((a) => a.batchId === req.params.id);
    res.json({ readings, alerts, thresholds: store.config.thresholds });
  });

  app.get('/api/alerts', (_req, res) => {
    res.json(store.alerts);
  });

  app.patch('/api/alerts/:id/ack', (req, res) => {
    const alert = store.alerts.find((a) => a.id === req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Alert not found.' });
      return;
    }
    alert.acknowledged = true;
    res.json(alert);
  });

  // =========================================================================
  // 5. DASHBOARD & PUBLIC REFERENCE DATA (/api/dashboard/*, /api/produce-types)
  // =========================================================================

  app.get('/api/dashboard/summary', (_req, res) => {
    res.json(store.getDashboardSummary());
  });

  app.get('/api/produce-types', (_req, res) => {
    res.json(store.produceTypes);
  });

  app.get('/api/settings/spoilage', (_req, res) => {
    res.json(store.config);
  });

  // =========================================================================
  // 6. ADMIN ENDPOINTS (/api/admin/* — Strictly ADMIN Role Required)
  // =========================================================================

  app.get('/api/admin/users', requireRoles('ADMIN'), (_req, res) => {
    res.json(
      store.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
      }))
    );
  });

  app.patch('/api/admin/users/:id/role', requireRoles('ADMIN'), (req, res) => {
    const { role } = req.body ?? {};
    if (!['ADMIN', 'INSPECTOR', 'USER'].includes(String(role))) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid role specified.' });
      return;
    }
    const target = store.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' });
      return;
    }
    target.role = role as UserRole;
    res.json({
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      createdAt: target.createdAt,
    });
  });

  app.get('/api/admin/produce-types', requireRoles('ADMIN'), (_req, res) => {
    res.json(store.produceTypes);
  });

  app.post('/api/admin/produce-types', requireRoles('ADMIN'), (req, res) => {
    const {
      name,
      category,
      optimalTempC,
      optimalHumidityPct,
      baselineShelfLifeDays,
      ethyleneSensitivity,
      gradeAMinScore,
      gradeBMinScore,
      gradeCMinScore,
    } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Produce name is required.' });
      return;
    }
    const item = {
      id: `pt-${crypto.randomUUID().slice(0, 6)}`,
      name: name.trim(),
      category: category === 'Vegetable' ? ('Vegetable' as const) : ('Fruit' as const),
      optimalTempC: String(optimalTempC || '4–8 °C'),
      optimalHumidityPct: String(optimalHumidityPct || '85–90%'),
      baselineShelfLifeDays: Math.max(1, Number(baselineShelfLifeDays || 7)),
      ethyleneSensitivity: (['Low', 'Medium', 'High'].includes(String(ethyleneSensitivity))
        ? ethyleneSensitivity
        : 'Medium') as 'Low' | 'Medium' | 'High',
      gradeAMinScore: Math.max(50, Math.min(98, Number(gradeAMinScore || 85))),
      gradeBMinScore: Math.max(30, Math.min(85, Number(gradeBMinScore || 65))),
      gradeCMinScore: Math.max(10, Math.min(65, Number(gradeCMinScore || 45))),
    };
    store.produceTypes.push(item);
    res.status(201).json(item);
  });

  app.put('/api/admin/settings', requireRoles('ADMIN'), (req, res) => {
    const body = req.body ?? {};
    const v = Number(body.visualWeight);
    const e = Number(body.ethyleneWeight);
    const a = Number(body.ammoniaWeight);
    const t = Number(body.temperatureWeight);
    const h = Number(body.humidityWeight);
    const sum = v + e + a + t + h;
    if (Number.isNaN(sum) || Math.abs(sum - 1) > 0.02) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Spoilage index weights must sum to 1.00 (100%).',
      });
      return;
    }
    store.config = {
      visualWeight: Number(v.toFixed(2)),
      ethyleneWeight: Number(e.toFixed(2)),
      ammoniaWeight: Number(a.toFixed(2)),
      temperatureWeight: Number(t.toFixed(2)),
      humidityWeight: Number(h.toFixed(2)),
      thresholds: {
        maxTempC: Number(body.thresholds?.maxTempC ?? store.config.thresholds.maxTempC),
        maxHumidityPct: Number(
          body.thresholds?.maxHumidityPct ?? store.config.thresholds.maxHumidityPct
        ),
        maxEthylenePpm: Number(
          body.thresholds?.maxEthylenePpm ?? store.config.thresholds.maxEthylenePpm
        ),
        maxAmmoniaPpm: Number(
          body.thresholds?.maxAmmoniaPpm ?? store.config.thresholds.maxAmmoniaPpm
        ),
        maxCo2Ppm: Number(body.thresholds?.maxCo2Ppm ?? store.config.thresholds.maxCo2Ppm),
        maxThermalSpotC: Number(
          body.thresholds?.maxThermalSpotC ?? store.config.thresholds.maxThermalSpotC
        ),
      },
    };
    res.json(store.config);
  });

  app.get('/api/admin/dataset', requireRoles('ADMIN'), (_req, res) => {
    res.json(store.feedbacks);
  });

  app.get('/api/admin/dataset/export', requireRoles('ADMIN'), (req, res) => {
    const format = String(req.query.format ?? 'csv').toLowerCase();
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="freshscan-retraining-dataset.json"'
      );
      res.send(JSON.stringify(store.feedbacks, null, 2));
      return;
    }
    const csv = buildRetrainingDatasetCsv(store.feedbacks);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="freshscan-retraining-dataset.csv"'
    );
    res.send(csv);
  });

  // Global API error handler (matches Spring @RestControllerAdvice JSON shape)
  app.use('/api', (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({
        error: 'UPLOAD_ERROR',
        message:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image exceeds the 10 MB maximum file size limit.'
            : err.message,
      });
      return;
    }
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected server error occurred.',
    });
  });

  // =========================================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
  // =========================================================================
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FreshScan AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start FreshScan AI server:', err);
  process.exit(1);
});
