import { describe, expect, it } from 'vitest';
import { createImportReport, importReportFromJson, importReportToJson, REPORT_VERSION } from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');

function baseReport() {
  return createImportReport({
    dpeNumber: 'X',
    schemaVariant: 'modele=1/version=2.3',
    generatedAt: date,
    parsedFields: [{ path: 'dpe/numero_dpe', value: 'X' }],
    inferredFields: [
      {
        path: 'dpe/logement/caracteristique_generale/hsp',
        value: 2.5,
        source: 'inference:default-ceiling-height-2.5m',
        confidence: 0.4,
        importDate: date.toISOString()
      }
    ],
    unrecognizedFields: [{ path: 'dpe/logement/sortie', occurrences: 3 }],
    missingFields: [{ path: 'logement/rooms', reason: 'no rooms in DPE' }]
  });
}

describe('ImportReport v1', () => {
  it('is versioned (reportVersion 1)', () => {
    expect(REPORT_VERSION).toBe(1);
    expect(baseReport().reportVersion).toBe(1);
  });

  it('rejects an inferred field without source', () => {
    expect(() =>
      createImportReport({
        dpeNumber: 'X',
        schemaVariant: 'v',
        generatedAt: date,
        parsedFields: [],
        inferredFields: [
          { path: 'p', value: 1, source: '', confidence: 0.5, importDate: date.toISOString() }
        ],
        unrecognizedFields: [],
        missingFields: []
      })
    ).toThrow(TypeError);
  });

  it('rejects an inferred field with confidence >= 1 (inferred is never measured)', () => {
    expect(() =>
      createImportReport({
        dpeNumber: 'X',
        schemaVariant: 'v',
        generatedAt: date,
        parsedFields: [],
        inferredFields: [
          { path: 'p', value: 1, source: 'inference:x', confidence: 1, importDate: date.toISOString() }
        ],
        unrecognizedFields: [],
        missingFields: []
      })
    ).toThrow(RangeError);
  });

  it('rejects an invalid importDate on an inferred field', () => {
    expect(() =>
      createImportReport({
        dpeNumber: 'X',
        schemaVariant: 'v',
        generatedAt: date,
        parsedFields: [],
        inferredFields: [
          { path: 'p', value: 1, source: 'inference:x', confidence: 0.5, importDate: 'not-a-date' }
        ],
        unrecognizedFields: [],
        missingFields: []
      })
    ).toThrow(TypeError);
  });

  it('JSON round-trip is identical', () => {
    const report = baseReport();
    const json = importReportToJson(report);
    expect(json.generatedAt).toBe('2026-11-20T10:00:00.000Z');
    const revived = importReportFromJson(JSON.parse(JSON.stringify(json)) as typeof json);
    expect(importReportToJson(revived)).toEqual(json);
  });
});
