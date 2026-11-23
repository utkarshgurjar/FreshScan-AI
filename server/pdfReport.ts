import PDFDocument from 'pdfkit';
import type { BatchSummary, ScanRecord, SensorReadingRecord } from '../src/types/freshscan.ts';

function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const escaped = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

export function buildBatchCsv(batch: BatchSummary, scans: ScanRecord[]): string {
  const header = [
    'Batch Code',
    'Supplier',
    'Scan ID',
    'Timestamp',
    'Produce Item',
    'Freshness',
    'Grade',
    'Visual Score',
    'Final Score',
    'Spoilage Index',
    'Confidence (%)',
    'Shelf Life (Days)',
    'Storage Recommendation',
    'Defect Count',
    'Inspector',
  ];

  const rows = scans.map((s) =>
    [
      batch.code,
      batch.supplier,
      s.id,
      s.createdAt,
      s.itemType,
      s.freshnessClass,
      s.qualityGrade,
      s.visualScore,
      s.qualityScore,
      s.spoilageIndex,
      s.confidence,
      s.estimatedShelfLifeDays,
      s.storageRecommendation,
      s.defects.length,
      s.inspectorName,
    ]
      .map(sanitizeCsvCell)
      .join(',')
  );

  return [header.join(','), ...rows].join('\n');
}

export function buildBatchPdfBuffer(
  batch: BatchSummary,
  scans: ScanRecord[],
  readings: SensorReadingRecord[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).fillColor('#0F172A').text('FreshScan AI — Batch Quality Report');
    doc
      .fontSize(10)
      .fillColor('#475569')
      .text(`Generated: ${new Date().toISOString()}   |   Batch Code: ${batch.code}`);
    doc.moveDown(0.8);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#CBD5E1').stroke();
    doc.moveDown(1);

    // Batch Metadata
    doc.fontSize(13).fillColor('#0F172A').text('1. Batch Specification');
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Supplier: ${batch.supplier}`);
    doc.text(`Category: ${batch.produceCategory}`);
    doc.text(`Received Date: ${batch.receivedDate}`);
    doc.text(`Storage Location: ${batch.storageLocation}`);
    doc.text(`Notes: ${batch.notes || 'None'}`);
    doc.moveDown(1);

    // Summary KPIs
    doc.fontSize(13).fillColor('#0F172A').text('2. Quality Summary');
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#334155');
    doc.text(
      `Total Scans: ${batch.totalScans}   |   Average Quality Score: ${batch.averageScore}/100   |   Active Alerts: ${batch.activeAlerts}`
    );
    doc.text(
      `Fresh: ${batch.freshPct}%   |   Ripe: ${batch.ripePct}%   |   Overripe: ${batch.overripePct}%   |   Rotten: ${batch.rottenPct}%`
    );
    doc.moveDown(1);

    // Sensor Telemetry Snapshot
    if (readings.length > 0) {
      const latest = readings[0];
      doc.fontSize(13).fillColor('#0F172A').text('3. Latest Thermal & Gas Telemetry');
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#334155');
      doc.text(
        `Device: ${latest.deviceId}   |   Temp: ${latest.temperatureC} °C   |   Humidity: ${latest.humidityPct}%`
      );
      doc.text(
        `Ethylene: ${latest.ethylenePpm} ppm   |   Ammonia: ${latest.ammoniaPpm} ppm   |   CO2: ${latest.co2Ppm} ppm   |   Thermal Peak: ${latest.thermalMaxC} °C`
      );
      doc.moveDown(1);
    }

    // Individual Scans
    doc.fontSize(13).fillColor('#0F172A').text('4. Individual Inspection Log');
    doc.moveDown(0.4);
    if (scans.length === 0) {
      doc.fontSize(10).fillColor('#64748B').text('No scans attached to this batch yet.');
    } else {
      scans.forEach((s, idx) => {
        if (doc.y > 720) doc.addPage();
        doc
          .fontSize(10)
          .fillColor('#0F172A')
          .text(
            `${idx + 1}. ${s.itemType} — Grade ${s.qualityGrade} (${s.freshnessClass}, Score ${s.qualityScore}/100)`
          );
        doc
          .fontSize(9)
          .fillColor('#475569')
          .text(
            `   ID: ${s.id} | Shelf Life: ${s.estimatedShelfLifeDays}d | Storage: ${s.storageRecommendation} | Defects: ${s.defects.length}`
          );
        doc.text(`   Notes: ${s.summaryNotes}`);
        doc.moveDown(0.45);
      });
    }

    doc.end();
  });
}

export function buildRetrainingDatasetCsv(
  feedbacks: Array<{
    id: string;
    scanId: string;
    isCorrect: boolean;
    predictedItem: string;
    correctedItem: string;
    predictedFreshness: string;
    correctedFreshness: string;
    notes: string;
    imageUrl: string;
    createdAt: string;
  }>
): string {
  const header = [
    'Feedback ID',
    'Scan ID',
    'Prediction Correct',
    'Predicted Item',
    'Ground Truth Item',
    'Predicted Freshness',
    'Ground Truth Freshness',
    'Image Asset',
    'Inspector Notes',
    'Logged At',
  ];
  const rows = feedbacks.map((f) =>
    [
      f.id,
      f.scanId,
      f.isCorrect ? 'true' : 'false',
      f.predictedItem,
      f.correctedItem,
      f.predictedFreshness,
      f.correctedFreshness,
      f.imageUrl,
      f.notes,
      f.createdAt,
    ]
      .map(sanitizeCsvCell)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export function buildScanPdfBuffer(scan: ScanRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#0F172A').text('FreshScan AI — Produce Inspection Certificate');
    doc
      .fontSize(10)
      .fillColor('#475569')
      .text(`Scan ID: ${scan.id}   |   Inspected At: ${scan.createdAt}   |   Inspector: ${scan.inspectorName}`);
    doc.moveDown(0.8);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#CBD5E1').stroke();
    doc.moveDown(1);

    doc.fontSize(14).fillColor('#0F172A').text(`${scan.itemType} — Grade ${scan.qualityGrade} (${scan.freshnessClass})`);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Final Quality Score: ${scan.qualityScore}/100   |   Visual Score: ${scan.visualScore}/100   |   Spoilage Index: ${scan.spoilageIndex}%`);
    doc.text(`Model Confidence: ${scan.confidence}%   |   Estimated Shelf Life: ${scan.estimatedShelfLifeDays} days`);
    doc.text(`Storage Recommendation: ${scan.storageRecommendation}   |   Mode: ${scan.usedSensorFusion ? 'Vision + Thermal/Gas Sensor Fusion' : 'Camera Vision Only'}`);
    doc.moveDown(0.8);

    doc.fontSize(12).fillColor('#0F172A').text('Color & Ripeness Analysis (HSV)');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Dominant Color: ${scan.colorAnalysis.dominantColor} (${scan.colorAnalysis.dominantHex})   |   Ripeness Index: ${scan.colorAnalysis.ripenessIndex}/100`);
    doc.text(`HSV Means: H=${scan.colorAnalysis.hueAvg}° / S=${scan.colorAnalysis.saturationAvg}% / V=${scan.colorAnalysis.valueAvg}%`);
    doc.text(`Summary: ${scan.colorAnalysis.hsvSummary}`);
    doc.moveDown(0.8);

    doc.fontSize(12).fillColor('#0F172A').text(`Detected Surface Defects (${scan.defects.length})`);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#334155');
    if (scan.defects.length === 0) {
      doc.text('No visible bruises, dark spots, mold, wrinkles, cuts, or insect damage detected.');
    } else {
      scan.defects.forEach((d, idx) => {
        doc.text(`${idx + 1}. ${d.type.replace('_', ' ')} [${d.severity}, ${d.confidence}%]: ${d.description}`);
      });
    }
    doc.moveDown(0.8);

    if (scan.sensorSnapshot) {
      doc.fontSize(12).fillColor('#0F172A').text('Attached Thermal & Gas Sensor Snapshot');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#334155');
      doc.text(
        `Temp: ${scan.sensorSnapshot.temperatureC} °C   |   Humidity: ${scan.sensorSnapshot.humidityPct}%   |   Ethylene: ${scan.sensorSnapshot.ethylenePpm} ppm`
      );
      doc.text(
        `Ammonia: ${scan.sensorSnapshot.ammoniaPpm} ppm   |   CO2: ${scan.sensorSnapshot.co2Ppm} ppm   |   Thermal Peak: ${scan.sensorSnapshot.thermalMaxC ?? scan.sensorSnapshot.temperatureC} °C`
      );
      doc.moveDown(0.8);
    }

    doc.fontSize(12).fillColor('#0F172A').text('Agronomic Summary Notes');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#334155').text(scan.summaryNotes);

    doc.end();
  });
}

export function buildScanCsv(scan: ScanRecord): string {
  const header = [
    'Scan ID',
    'Timestamp',
    'Batch ID',
    'Inspector',
    'Item Type',
    'Freshness',
    'Grade',
    'Visual Score',
    'Final Quality Score',
    'Spoilage Index',
    'Confidence (%)',
    'Shelf Life (Days)',
    'Storage Recommendation',
    'Dominant Color',
    'Ripeness Index',
    'Defect Count',
    'Sensor Fusion',
    'Summary Notes',
  ];
  const row = [
    scan.id,
    scan.createdAt,
    scan.batchId ?? 'Standalone',
    scan.inspectorName,
    scan.itemType,
    scan.freshnessClass,
    scan.qualityGrade,
    scan.visualScore,
    scan.qualityScore,
    scan.spoilageIndex,
    scan.confidence,
    scan.estimatedShelfLifeDays,
    scan.storageRecommendation,
    scan.colorAnalysis.dominantColor,
    scan.colorAnalysis.ripenessIndex,
    scan.defects.length,
    scan.usedSensorFusion ? 'true' : 'false',
    scan.summaryNotes,
  ]
    .map(sanitizeCsvCell)
    .join(',');
  return [header.join(','), row].join('\n');
}


