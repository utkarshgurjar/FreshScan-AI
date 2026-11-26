# FreshScan AI
## Camera-Based Fruit and Vegetable Quality Inspection Platform

FreshScan AI is an intelligent fruit and vegetable quality inspection platform that uses computer vision, machine learning, and optional IoT sensor integration to evaluate produce freshness, detect defects, classify quality grades, and manage inventory batches.

The platform supports real-time camera scanning, multi-angle image uploads, AI-powered quality inspection, defect localization, optional thermal and gas sensor integration, batch inventory tracking, and installable Progressive Web App (PWA) support.

The system uses free and open-source AI technologies, allowing image analysis and model inference without requiring paid AI APIs or Gemini API keys.

## 1. Core Features

### 1.1 Live Camera and Multi-Angle Scanning

- Capture images using a mobile rear camera with `capture="environment"`.
- Support live webcam scanning through `getUserMedia`.
- Upload up to 4 images from different angles.
- Support JPG, PNG, and WebP formats.
- Maximum image size: 10 MB per image.
- Automatic image quality checking before uploading.
- Blur detection to reject unclear images.
- Low-light detection to improve scanning accuracy.
- HSV color analysis for ripeness estimation.
- Automatic image compression for faster processing.

### 1.2 AI-Based Produce Quality Analysis

Use free, open-source computer vision and machine learning models to analyze fruit and vegetable quality.

Supported produce categories:

- Apple
- Banana
- Tomato
- Potato
- Mango
- Orange
- Cucumber
- Strawberry
- Bell Pepper
- Grapes
- Custom administrator-defined categories

The AI inspection system provides:

- Produce type classification.
- Freshness classification: Fresh, Ripe, Overripe, or Rotten.
- Quality grading: A, B, C, or Reject.
- Visual quality score from 0 to 100.
- Prediction confidence percentage.
- Estimated remaining shelf life in days.
- Recommended storage conditions.
- HSV-based ripeness index.
- Defect identification and localization.
- Toggleable defect bounding boxes.
- Grad-CAM attention heatmaps.

### 1.3 Free and Open-Source AI Architecture

The application must not depend on paid AI APIs.

Use the following technologies:

- TensorFlow/Keras for machine learning model development and training.
- MobileNetV2 for produce classification and freshness recognition.
- OpenCV for image processing and defect analysis.
- ONNX Runtime for local AI model inference.
- FastAPI for exposing AI prediction endpoints.
- Python for AI processing and model management.

AI inference should run locally or on the application's own server.

No Gemini API key, paid AI subscription, or external commercial AI API should be required.

### 1.4 Optional Thermal and Gas IoT Sensor Integration

The application must work independently using camera-based inspection.

Optional IoT integration can improve quality assessment through:

- Temperature monitoring.
- Humidity monitoring.
- Ethylene detection.
- Ammonia detection.
- CO₂ monitoring.
- MLX90640 thermal sensor matrices (8×8).

Additional capabilities:

- Configurable spoilage-index weights.
- Real-time threshold alerts.
- Gas and temperature trend charts.
- Combined visual and sensor-based quality scoring.

Supported hardware:

- ESP32
- MQ-135
- MQ-3
- DHT22
- MLX90640

Communication protocols: REST API and MQTT.

### 1.5 Batch and Inventory Management

- Create and manage supplier storage batches.
- Assign individual scans to batches.
- Track produce quality across batches.
- Automatically calculate percentage of fresh produce.
- Automatically calculate percentage of rotten produce.
- Calculate average quality scores.
- Search and filter scan history.
- Filter by produce type, grade, batch, date, or user.
- Maintain complete batch inspection records.

Export options:

- Individual Scan PDF.
- Individual Scan CSV.
- Batch Audit PDF.
- Batch CSV.

### 1.6 User Authentication and Role-Based Access Control

Implement secure JWT-based authentication with refresh token rotation.

Supported roles:

- ADMIN
- INSPECTOR
- USER

Features:

- Secure registration and login.
- Role-based dashboard access.
- Protected API endpoints.
- Inspectors and users can verify AI predictions.
- Users can submit corrected ground-truth labels.
- Admins can export retraining datasets in CSV or JSON format.
- Maintain model feedback records for future improvements.

### 1.7 Progressive Web App (PWA)

Make FreshScan AI installable on Android, iPhone, and desktop devices.

Features:

- Installable PWA support.
- Add to Home Screen functionality.
- Mobile rear-camera access.
- Responsive mobile interface.
- Bottom navigation for mobile users.
- Mobile-friendly inspection cards.
- Bottom-sheet modals.
- Offline UI shell caching.
- Fast loading and optimized image uploads.

## 2. Technology Stack

### 2.1 Frontend

- React 19
- TypeScript
- Tailwind CSS v4
- Recharts
- Lucide Icons
- Vite
- vite-plugin-pwa

### 2.2 Main Application Backend

- Node.js 20+
- Express.js
- TypeScript
- Multer for image uploads
- PDFKit for report generation
- JSON-based persistence for the initial application version
- Local validated image storage

### 2.3 Free AI and Machine Learning

- Python
- TensorFlow/Keras
- MobileNetV2
- OpenCV
- ONNX Runtime
- FastAPI
- NumPy
- Pillow
- Grad-CAM visualization

### 2.4 Database and Storage

For the initial application:

- Atomic JSON state persistence.
- Local image storage.

For the production version:

- MySQL 8.
- Spring Data JPA.
- Flyway database migrations.
- Structured image storage.

### 2.5 Java Spring Boot Production Backend

- Java 21
- Spring Boot 3.3
- Spring Security
- JWT Authentication
- Spring Data JPA
- MySQL 8
- Flyway
- MapStruct
- OpenPDF
- Springdoc OpenAPI
- Bucket4j rate limiting

### 2.6 IoT and DevOps

- ESP32
- MQ-135
- MQ-3
- DHT22
- MLX90640
- REST API
- MQTT
- Docker
- Docker Compose
- JUnit 5
- Testcontainers

## 3. Local Setup

### 3.1 Prerequisites

Install:

- Node.js 20 or later.
- Python 3.10 or later.
- npm or Bun.
- Git.
- Java 21 for the Spring Boot backend.
- Maven.
- MySQL 8 for production database integration.

No paid AI API key is required.

### 3.2 Install Frontend and Backend Dependencies

Clone the project and navigate to its directory.

```bash
npm install
```

### 3.3 Install AI Dependencies

Create a Python virtual environment.

```bash
python -m venv venv
```

Activate it on Windows:

```bash
venv\Scripts\activate
```

Install the required Python packages:

```bash
pip install tensorflow opencv-python onnxruntime fastapi uvicorn numpy pillow
```

### 3.4 Run the Application

Start the frontend and main backend:

```bash
npm run dev
```

Start the AI inference server separately:

```bash
uvicorn main:app --reload --port 8000
```

Open the application in your browser using the development URL displayed by Vite.

### 3.5 Production Build

```bash
npm run build
npm start
```

## 4. Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Register user or inspector |
| POST | /api/auth/login | Authenticate user |
| POST | /api/auth/refresh | Rotate refresh token |
| POST | /api/scans | Upload produce images |
| GET | /api/scans | Retrieve scan history |
| GET | /api/scans/:id/report | Export scan PDF or CSV |
| POST | /api/scans/:id/feedback | Submit prediction feedback |
| GET/POST | /api/batches | Retrieve or create batches |
| GET | /api/batches/:id/report | Export batch reports |
| POST | /api/sensors/readings | Receive IoT sensor data |
| GET | /api/dashboard/summary | Retrieve dashboard statistics |
| GET | /api/admin/dataset/export | Export AI training dataset |
| GET | /api/docs/openapi.json | Retrieve API specification |

### 4.1 AI Inference Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /predict | Predict produce type and freshness |
| POST | /analyze | Complete quality inspection |
| POST | /detect-defects | Identify visible defects |
| POST | /gradcam | Generate attention heatmap |
| GET | /health | Check AI service status |

## 5. AI Model Training and Improvement

The system should support continuous model improvement.

Training workflow:

1. Collect fruit and vegetable images.
2. Organize images into produce and freshness categories.
3. Preprocess images using OpenCV.
4. Train MobileNetV2 using TensorFlow/Keras.
5. Evaluate model accuracy.
6. Export the trained model to ONNX format.
7. Load the model using ONNX Runtime.
8. Connect the model to the FastAPI inference server.
9. Collect user corrections and verified predictions.
10. Use validated feedback to retrain and improve the model.

Use freely available datasets or properly licensed self-collected images.

## 6. Java Spring Boot Production Blueprint

Include a complete downloadable Java Spring Boot 3.x production reference project containing:

- Java 21 source code.
- Maven pom.xml.
- Flyway MySQL migrations.
- JPA entities and repositories.
- JWT security and refresh token rotation.
- Role-based access control.
- Bucket4j rate limiting.
- JavaCV/OpenCV image validation.
- ONNX Runtime Java integration.
- Optional FastAPI inference integration.
- OpenPDF report generation.
- Python MobileNetV2 training script.
- Dockerfile.
- Docker Compose configuration.
- JUnit 5 tests.
- Testcontainers integration tests.
- ESP32 Arduino firmware.
- OpenAPI 3.0.3 JSON specification.

Provide a downloadable project scaffold containing all required files and setup instructions.

## 7. Important Development Requirements

- The complete application must work without paid AI APIs.
- Use locally hosted or self-hosted open-source AI models.
- Do not require a Gemini API key.
- Keep camera-based inspection functional without IoT hardware.
- Ensure the AI inference service can run independently.
- Use proper image validation and secure file storage.
- Implement authentication and authorization securely.
- Provide responsive desktop and mobile interfaces.
- Include meaningful loading states and error handling.
- Ensure all dashboard statistics come from actual stored data.
- Clearly distinguish actual model predictions from heuristic estimates.
- Do not generate fake AI confidence scores or defect locations.
- Make the application suitable for future production deployment.

## 8. License

Apache License 2.0.

All third-party models, datasets, and libraries must be used according to their respective licenses.
