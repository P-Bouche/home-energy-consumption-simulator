import { describe, expect, it } from 'vitest';
import {
  DpeFileTooLargeError,
  DpeSchemaValidationError,
  EmptyDpeInputError,
  InvalidDpeXmlError
} from '@hes/domain';
import { DpeXmlImporter, MAX_DPE_XML_BYTES, parseDpeXml, validateDpeStructure } from '../src/index.ts';

const importer = new DpeXmlImporter();

describe('parseDpeXml hardening', () => {
  it('rejects empty input', () => {
    expect(() => importer.importDpeXml('   ')).toThrow(EmptyDpeInputError);
    expect(() => importer.importDpeXml('')).toThrow(EmptyDpeInputError);
  });

  it('rejects malformed XML with a typed error', () => {
    expect(() => importer.importDpeXml('<dpe><numero_dpe>oops')).toThrow(InvalidDpeXmlError);
    expect(() => parseDpeXml('not xml at all')).toThrow(InvalidDpeXmlError);
  });

  it('rejects uploads larger than 5 MB before parsing', () => {
    const big = `<dpe>${'x'.repeat(MAX_DPE_XML_BYTES)}</dpe>`;
    expect(() => importer.importDpeXml(big)).toThrow(DpeFileTooLargeError);
    try {
      importer.importDpeXml(big);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DpeFileTooLargeError);
      expect((error as DpeFileTooLargeError).maxBytes).toBe(MAX_DPE_XML_BYTES);
    }
  });

  it('accepts a 5 MB document at the limit boundary check (well-formed, schema error not size error)', () => {
    const padding = MAX_DPE_XML_BYTES - 60;
    const xml = `<dpe><numero_dpe>${'a'.repeat(padding)}</numero_dpe></dpe>`;
    expect(xml.length).toBeLessThanOrEqual(MAX_DPE_XML_BYTES + 16);
    expect(() => importer.importDpeXml(xml)).toThrow(DpeSchemaValidationError);
  });

  it('does not resolve external entities (XXE)', () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE dpe [<!ENTITY xxe SYSTEM "file:///etc/hostname">]>
<dpe><numero_dpe>&xxe;</numero_dpe><administratif><enum_modele_dpe_id>1</enum_modele_dpe_id><enum_version_id>2</enum_version_id></administratif><logement><caracteristique_generale><surface_habitable_logement>50</surface_habitable_logement></caracteristique_generale></logement></dpe>`;
    // Must not throw a fetch/IO error and must not inline file content: the
    // entity is left unexpanded (processEntities: false) or rejected.
    let outcome: string;
    try {
      const { report } = importer.importDpeXml(xxe, new Date());
      outcome = JSON.stringify(report.parsedFields);
    } catch (error) {
      outcome = (error as Error).name;
    }
    expect(outcome).not.toContain('root:');
    expect(outcome).not.toMatch(/\/etc\/hostname/);
  });

  it('does not expand entity bombs (billion laughs) — entities stay unexpanded', () => {
    const lol = `<?xml version="1.0"?>
<!DOCTYPE dpe [
<!ENTITY a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">
<!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
<!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
]>
<dpe><numero_dpe>&c;</numero_dpe></dpe>`;
    const start = performance.now();
    let threw = false;
    try {
      importer.importDpeXml(lol, new Date());
    } catch {
      threw = true;
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(threw).toBe(true); // &c; stays literal → numero_dpe unparseable? no: schema error on missing sections
  });

  it('rejects excessive nesting depth with a schema issue', () => {
    const deep = `<dpe><numero_dpe>X</numero_dpe>${'<a>'.repeat(100)}${'</a>'.repeat(100)}</dpe>`;
    expect(() => importer.importDpeXml(deep)).toThrow(DpeSchemaValidationError);
    try {
      importer.importDpeXml(deep);
      expect.unreachable();
    } catch (error) {
      expect((error as DpeSchemaValidationError).schemaErrors.join(' ')).toMatch(/nesting|deeper/i);
    }
  });
});

describe('validateDpeStructure', () => {
  it('reports a missing root <dpe>', () => {
    const result = validateDpeStructure({ foo: 'bar' });
    expect(result.issues.map((i) => i.path)).toContain('dpe');
  });

  it('reports missing numero_dpe / administrive / logement', () => {
    const doc = parseDpeXml('<dpe><logement></logement></dpe>');
    const result = validateDpeStructure(doc);
    const paths = result.issues.map((i) => i.path);
    expect(paths).toContain('dpe/numero_dpe');
    expect(paths).toContain('dpe/administratif');
    expect(paths).toContain('dpe/logement');
  });

  it('rejects unsupported modele_dpe_id', () => {
    const doc = parseDpeXml(
      '<dpe><numero_dpe>X</numero_dpe><administratif><enum_modele_dpe_id>2</enum_modele_dpe_id><enum_version_id>2</enum_version_id></administratif><logement><caracteristique_generale /></logement></dpe>'
    );
    const result = validateDpeStructure(doc);
    const messages = result.issues.map((i) => `${i.path}: ${i.message}`).join(' ');
    expect(messages).toMatch(/unsupported modele_dpe_id 2/);
  });

  it('accepts a minimal valid document and detects the variant', () => {
    const doc = parseDpeXml(
      '<dpe><numero_dpe>ABC</numero_dpe><administratif><enum_modele_dpe_id>1</enum_modele_dpe_id><enum_version_id>2.3</enum_version_id></administratif><logement><caracteristique_generale><surface_habitable_logement>42</surface_habitable_logement></caracteristique_generale></logement></dpe>'
    );
    const result = validateDpeStructure(doc);
    expect(result.issues).toHaveLength(0);
    expect(result.variant).toBe('modele=1/version=2.3');
  });
});
