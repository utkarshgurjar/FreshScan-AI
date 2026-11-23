# FreshScan AI

**Camera-based Fruit & Vegetable Quality Inspection Platform** with real-time AI vision grading, defect localization, optional thermal & gas IoT sensor fusion, batch inventory tracking, installable mobile PWA support, and a complete downloadable **Java Spring Boot 3.x + ONNX / FastAPI + ESP32** production reference blueprint.

---

## Features

- **Live Camera & Multi-Angle Scanning**
  - Capture from mobile rear camera (`capture="environment"`), live browser webcam (`getUserMedia`), or upload up to 4 angle photos (JPG/PNG/WebP, max 10 MB).
  - Automatic client-side optical precheck for sharpness (blur detection), luminance (low-light rejection), and HSV color swatches, plus automatic compression for fast uploads.
- **AI Produce Quality Analysis**
  - Classifies produce type (Apple, Banana, Tomato, Potato, Mango, Orange, Cucumber, Strawberry, Bell Pepper, Grapes, and custom admin-defined classes).
  - Reports freshness class (`Fresh` / `Ripe` / `Overripe` / `Rotten`), quality grade (`A` / `B` / `C` / `Reject`), visual & fused quality score (`0–100`), confidence percentage, estimated remaining shelf life (days), storage recommendation, HSV ripeness index, and toggleable **defect bounding boxes + Grad-CAM attention heatmap**.
- **Optional Thermal & Gas IoT Sensor Fusion**
  - Works fully with camera-only scans or fuses live IoT telemetry (temperature, humidity, ethylene, ammonia, CO₂, and 8×8 MLX90640 thermal matrices) using configurable spoilage-index weights.
  - Real-time threshold alerting and time-series gas/temperature trend charts.
- **Batch & Inventory Management**
  - Organize scans into supplier storage batches with automatic `% Fresh`, `% Rotten`, and average score rollups.
  - Search and filter scan history by keyword, produce item, grade, batch, date range, or **My History**.
  - Export **Scan PDF**, **Scan CSV**, **Batch Audit PDF**, and **Batch CSV** reports.
- **Role-Based Access Control (RBAC) & Model Feedback Loop**
  - JWT Bearer authentication with refresh token rotation (`ADMIN`, `INSPECTOR`, `USER`).
  - Inspectors and users can verify predictions or submit corrected ground-truth labels; Admins export the retraining dataset as **CSV** or **JSON**.
- **Mobile-Ready Progressive Web App (PWA)**
  - Installable on Android Chrome and iPhone/iPad Safari (`Add to Home Screen`) with bottom thumb-zone navigation, mobile card views, bottom-sheet modals, and offline UI shell caching.
- **Java Spring Boot 3.x Production Blueprint**
  - Built-in **Spring Boot Code** tab with 30+ standalone production files (Java 21, Spring Boot 3.3, Maven `pom.xml`, Flyway MySQL migrations, JPA entities/repositories, JWT security + Bucket4j rate limiting, JavaCV/OpenCV validation, ONNX Runtime & FastAPI inference options, OpenPDF reports, Python MobileNetV2 training script, `Dockerfile` + `docker-compose.yml`, JUnit 5 + Testcontainers, and ESP32 Arduino firmware) plus one-click scaffold download and live OpenAPI 3.0.3 JSON.

---

## Tech Stack

### Live Web & Mobile PWA Runtime
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide Icons, `vite-plugin-pwa`
- **Backend**: Node.js, Express, `tsx`, Multer, PDFKit, `@google/genai` (server-side vision inspection)
- **Persistence**: Atomic JSON state persistence (`data/freshscan-state.json`) + local validated image storage (`uploads/`)

### Standalone Enterprise Blueprint (Included in App)
- **Backend**: Java 21, Spring Boot 3.3, Spring Security (JWT), Spring Data JPA, Flyway, MySQL 8, MapStruct, OpenPDF, Springdoc OpenAPI
- **Computer Vision & ML**: JavaCV (OpenCV), ONNX Runtime for Java, Python TensorFlow/Keras (MobileNetV2 transfer learning → ONNX), FastAPI inference microservice
- **IoT & DevOps**: ESP32 + MQ-135 + MQ-3 + DHT22 + MLX90640 (REST / MQTT), Docker, Docker Compose, JUnit 5 + Testcontainers

---

## Local Setup

### 1. Prerequisites
- Node.js 20+ (or Bun)
- A Gemini API key for live AI produce image analysis

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY="your_gemini_api_key"
APP_URL="http://localhost:3000"
# Optional: set a fixed passcode for Admin sign-in (otherwise use first-run setup in UI)
ADMIN_PASSCODE=""
```

### 3. Install Dependencies & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Production Build

```bash
npm run build
npm start
```

---

## Key API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register a `USER` or `INSPECTOR` account |
| `POST` | `/api/auth/login` | Authenticate and receive JWT access & refresh tokens |
| `POST` | `/api/auth/refresh` | Rotate access token via refresh token |
| `POST` | `/api/scans` | Upload 1–4 produce images (+ optional sensor snapshot) for AI grading |
| `GET` | `/api/scans` | Search and filter scan history |
| `GET` | `/api/scans/:id/report?format=pdf\|csv` | Export individual scan certificate (PDF or CSV) |
| `POST` | `/api/scans/:id/feedback` | Mark prediction correct/wrong and log to retraining dataset |
| `GET` / `POST` | `/api/batches` | List or create supplier produce storage batches |
| `GET` | `/api/batches/:id/report?format=pdf\|csv` | Export batch audit report (PDF or CSV) |
| `POST` | `/api/sensors/readings` | Ingest ESP32 gas, temperature, humidity & thermal matrix packet |
| `GET` | `/api/dashboard/summary` | Fetch KPIs, daily scan counts, grade distribution & top defects |
| `GET` | `/api/admin/dataset/export?format=csv\|json` | Export retraining dataset (`ADMIN`) |
| `GET` | `/api/docs/openapi.json` | Live OpenAPI 3.0.3 specification |

---

## License

Apache-2.0
