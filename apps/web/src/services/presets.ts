/**
 * Level-M preset cards (issue #32, UX audit 2026-11-21 §F7-M): plain-language
 * choices mapped to the raw command values the domain/engine consume.
 * Presentation only — the command still sends the raw U / Uw / enum id.
 *
 * U values are representative mid-band values within the domain bounds
 * (opaque (0, 4], windows (0, 6] W/m².K — issue #48 rework).
 */

export interface UPreset {
  readonly label: string;
  readonly u: number;
}

/** Wall / roof / floor insulation presets, mapped to U bands (u-reading.ts). */
export const U_PRESETS: readonly UPreset[] = [
  { label: 'Non isolé', u: 1.7 },
  { label: 'Isolation standard', u: 0.6 },
  { label: 'Isolation renforcée type 2025', u: 0.18 }
];

export interface WindowPreset {
  readonly label: string;
  readonly uw: number;
  /** DPE enum_type_vitrage_id — the preset sets the whole coherent group (brainstorm #32) */
  readonly glazingType: string;
  /** solar factor, engine tv `sw` table defaults per vitrage family */
  readonly sw: number;
}

/**
 * Window glazing presets: one click fills Uw + glazingType + Sw together
 * (single v1 command, contract unchanged). Uw single glazing reaches ~4.7;
 * Sw values are the @open3cl/engine tv.sw defaults (simple 0.58, double 0.52,
 * double VIR 0.45, triple 0.46).
 */
export const WINDOW_PRESETS: readonly WindowPreset[] = [
  { label: 'Simple vitrage', uw: 4.7, glazingType: '1', sw: 0.58 },
  { label: 'Double vitrage', uw: 2.4, glazingType: '2', sw: 0.52 },
  { label: 'Double vitrage récent', uw: 1.1, glazingType: '2', sw: 0.45 },
  { label: 'Triple vitrage', uw: 0.8, glazingType: '3', sw: 0.46 }
];

export interface HeatingPreset {
  readonly label: string;
  /** DPE enum_type_generateur_ch_id — engine-effective via the v2 command (ADR-0004) */
  readonly generatorType: string;
}

export const HEATING_PRESETS: readonly HeatingPreset[] = [
  { label: 'Pompe à chaleur air/eau', generatorType: '7' },
  { label: 'Chaudière gaz à condensation', generatorType: '97' },
  { label: 'Chaudière gaz standard', generatorType: '89' },
  { label: 'Poêle à bois (label Flamme Verte)', generatorType: '42' },
  { label: 'Convecteur électrique', generatorType: '98' }
];

export interface VentilationPreset {
  readonly label: string;
  /** DPE enum_type_ventilation_id */
  readonly ventilationType: string;
}

export const VENTILATION_PRESETS: readonly VentilationPreset[] = [
  { label: 'VMC simple flux', ventilationType: '6' },
  { label: 'VMC double flux', ventilationType: '20' }
];
