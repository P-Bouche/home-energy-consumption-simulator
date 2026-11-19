/**
 * Minimal typed surface of the pinned engine @open3cl/engine@1.11.6.
 *
 * The npm tarball ships no declaration for its entry point (only enums.d.ts/tv.d.ts),
 * so this ambient declaration is the adapter's typed contract with the engine.
 * Verified against node_modules/@open3cl/engine@1.11.6 (index.js / engine.js).
 */
declare module '@open3cl/engine' {
  /**
   * Options accepted by the engine entry points (engine.js: sanitize defaults to true).
   */
  export interface Calcul3clOptions {
    sanitize?: boolean;
    compat_for_corpus_analysis?: boolean;
  }

  /**
   * Loose structural type of an engine result. The adapter validates every field it reads.
   */
  export type EngineDpeResult = Record<string, unknown>;

  /**
   * DPE energy class and GES climate class letters (A..G) for a computed DPE.
   */
  export interface ClasseGesDpe {
    dpeClass: string;
    gesClass: string;
  }

  /**
   * Runs the 3CL-DPE calculation from raw DPE XML content.
   *
   * @returns the full engine result, or null when the DPE model is not implemented
   * @throws on malformed XML (the engine throws a plain TypeError)
   */
  export function calcul_3cl_xml(
    dpeXmlContent: string,
    options?: Calcul3clOptions
  ): EngineDpeResult | null;

  /**
   * Runs the 3CL-DPE calculation from an already-parsed DPE object.
   *
   * @returns the full engine result, or null when the DPE model is not implemented
   */
  export function calcul_3cl(
    dpeObject: Record<string, unknown>,
    options?: Calcul3clOptions
  ): EngineDpeResult | null;

  /**
   * Computes the DPE (energy) and GES (climate) etiquette classes of a computed DPE result.
   */
  export function get_classe_ges_dpe(dpe: EngineDpeResult): ClasseGesDpe;

  /**
   * Returns the engine version string, e.g. "1.11.6".
   */
  export function getVersion(): string;
}
