import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import engineEnums from '@open3cl/engine/enums.js';
import {
  ENUM_LABELS,
  ENUM_LABEL_KINDS,
  enumLabel,
  isEnumLabelKind,
  type EnumLabelKind
} from '@hes/open3cl-adapter';

/**
 * Which engine enum table (src/enums.js of @open3cl/engine@1.11.6) backs each
 * vendored kind, and which DPE XML field carries the raw id in source DPEs.
 */
const KIND_TO_ENGINE_TABLE: Record<EnumLabelKind, { table: string; xmlField: string }> = {
  orientation: { table: 'orientation', xmlField: 'enum_orientation_id' },
  wallType: { table: 'materiaux_structure_mur', xmlField: 'enum_materiaux_structure_mur_id' },
  roofType: { table: 'type_plancher_haut', xmlField: 'enum_type_plancher_haut_id' },
  floorType: { table: 'type_plancher_bas', xmlField: 'enum_type_plancher_bas_id' },
  adjacencyType: { table: 'type_adjacence', xmlField: 'enum_type_adjacence_id' },
  glazingType: { table: 'type_vitrage', xmlField: 'enum_type_vitrage_id' },
  frameMaterial: { table: 'type_materiaux_menuiserie', xmlField: 'enum_type_materiaux_menuiserie_id' },
  installationType: { table: 'type_installation', xmlField: 'enum_type_installation_id' },
  ventilationType: { table: 'type_ventilation', xmlField: 'enum_type_ventilation_id' }
};

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

describe('enum-labels (vendored engine tables)', () => {
  it('exposes one non-empty table per enum kind', () => {
    expect(ENUM_LABEL_KINDS).toHaveLength(9);
    for (const kind of ENUM_LABEL_KINDS) {
      expect(Object.keys(ENUM_LABELS[kind]).length).toBeGreaterThan(0);
    }
  });

  it('is byte-identical to the live tables of the pinned @open3cl/engine@1.11.6', () => {
    for (const kind of ENUM_LABEL_KINDS) {
      const { table } = KIND_TO_ENGINE_TABLE[kind];
      expect(ENUM_LABELS[kind], `kind ${kind} must match engine table ${table}`).toEqual(engineEnums[table]);
    }
  });

  it('maps known ids to their French label (audit fixture values: orientation 2, wallType 13, adjacency 1)', () => {
    expect(enumLabel('orientation', '2')).toBe('nord');
    expect(enumLabel('wallType', '13')).toBe('murs en béton banché');
    expect(enumLabel('adjacencyType', '1')).toBe('extérieur');
    expect(enumLabel('glazingType', '2')).toBe('double vitrage');
    expect(enumLabel('frameMaterial', '3')).toBe('bois');
    expect(enumLabel('installationType', '4')).toBe(
      'installation hybride collective-individuelle (chauffage base + appoint individuel ou convecteur bi-jonction)'
    );
    expect(enumLabel('ventilationType', '2')).toBe("ventilation par entrées d'air hautes et basses");
  });

  it('returns null for an unknown id — callers must show the raw id, never guess a label', () => {
    expect(enumLabel('orientation', '999')).toBeNull();
    expect(enumLabel('wallType', '')).toBeNull();
    expect(isEnumLabelKind('orientation')).toBe(true);
    expect(isEnumLabelKind('nope')).toBe(false);
  });

  it('maps every enum id used by the DPE fixtures (and the catalog placeholders) to a label', () => {
    const missing: string[] = [];
    let seen = 0;
    for (const file of readdirSync(FIXTURES_DIR)) {
      if (!file.endsWith('.xml')) continue;
      const xml = readFileSync(`${FIXTURES_DIR}/${file}`, 'utf8');
      for (const kind of ENUM_LABEL_KINDS) {
        const { xmlField } = KIND_TO_ENGINE_TABLE[kind];
        for (const match of xml.matchAll(new RegExp(`${xmlField}>([^<]+)<`, 'g'))) {
          const id = match[1]?.trim() ?? '';
          if (id === '') continue; // self-closing tags carry no id
          seen += 1;
          if (enumLabel(kind, id) === null) missing.push(`${file} ${xmlField}=${id}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(1000); // guard against a silently empty scan
    expect(missing).toEqual([]);
    // the scenario catalog placeholders (apps/web command-catalog.ts) must resolve too
    expect(enumLabel('installationType', '4')).not.toBeNull();
    expect(enumLabel('ventilationType', '2')).not.toBeNull();
  });
});
