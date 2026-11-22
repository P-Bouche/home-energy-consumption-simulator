import { describe, expect, it } from 'vitest';
import { confidenceInWords } from '../src/services/confidence-words.ts';

describe('confidenceInWords', () => {
  it('renders values read from the DPE XML as measured by the DPE', () => {
    expect(confidenceInWords({ source: 'dpe-xml:dpe/logement/enveloppe/mur_collection/mur[1]/u_mur', confidence: 1 })).toBe(
      'mesuré par le DPE'
    );
  });

  it('renders inferred values (confidence < 1) as estimated, to verify', () => {
    expect(confidenceInWords({ source: 'inference:roof-synthesized', confidence: 0.9 })).toBe('estimé — à vérifier');
    expect(confidenceInWords({ source: 'geometry:synthesized-floor', confidence: 0.4 })).toBe('estimé — à vérifier');
  });

  it('renders user-entered values as such, whatever the score', () => {
    expect(confidenceInWords({ source: 'user', confidence: 1 })).toBe('saisi par vous');
    expect(confidenceInWords({ source: 'user', confidence: 0.5 })).toBe('saisi par vous');
  });

  it('renders other full-confidence sources as measured', () => {
    expect(confidenceInWords({ source: 'engine:open3cl', confidence: 1 })).toBe('mesuré');
  });

  it('never presents an inferred value as certain', () => {
    for (const confidence of [0, 0.25, 0.5, 0.7, 0.99]) {
      expect(confidenceInWords({ source: 'inference:x', confidence })).toBe('estimé — à vérifier');
    }
  });

  it('never labels a sub-1 confidence value "mesuré par le DPE", even with a dpe-xml source (review #35)', () => {
    // building element ConfidenceJson values have no domain guarantee on the
    // source of sub-1 scores — mission D reuses this helper on them
    expect(confidenceInWords({ source: 'dpe-xml:dpe/logement/...', confidence: 0.7 })).toBe('estimé — à vérifier');
    expect(confidenceInWords({ source: 'dpe-xml:dpe/logement/...', confidence: 1 })).toBe('mesuré par le DPE');
  });
});
