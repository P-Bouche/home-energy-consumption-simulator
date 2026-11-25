/**
 * Vendored DPE/3CL enum label tables (enum id -> French label) used by the web
 * editor to show human-readable labels over the frozen raw-id command
 * contract (ADR-0003). Pure static typed data: this module MUST NOT import
 * `@open3cl/engine` (the published 1.11.6 entry point does not export the
 * enum tables anyway), so it stays safely inside the adapter package without
 * touching the ADR-0001 engine boundary, and `apps/web` never depends on the
 * adapter — it reaches these tables through the read-only API endpoint
 * `GET /enums/:kind`.
 *
 * Provenance: copied verbatim from `@open3cl/engine@1.11.6` (MIT license),
 * source file `src/enums.js` (published at the package root as `enums.js`
 * in the npm tarball), tables: orientation, materiaux_structure_mur, type_plancher_haut, type_plancher_bas, type_adjacence, type_vitrage, type_materiaux_menuiserie, type_installation, type_ventilation, type_generateur_ch (ADR-0004).
 * The contract test `test/enum-labels.test.ts` asserts these tables are
 * byte-identical to the live engine tables of the pinned version. If a future
 * engine pin exports the enum tables from its entry point, prefer that live
 * export over this vendored copy.
 */

/**
 * Enum kinds exposed to the web editor, named after the domain command fields
 * (see `packages/domain/src/commands.ts`). Each kind maps to one engine enum
 * table (documented in the provenance comment above).
 */
export type EnumLabelKind =
  | 'orientation'
  | 'wallType'
  | 'roofType'
  | 'floorType'
  | 'adjacencyType'
  | 'glazingType'
  | 'frameMaterial'
  | 'installationType'
  | 'ventilationType'
  | 'generatorType';

/**
 * All enum kinds served by `GET /enums/:kind`.
 */
export const ENUM_LABEL_KINDS: readonly EnumLabelKind[] = [
  'orientation',
  'wallType',
  'roofType',
  'floorType',
  'adjacencyType',
  'glazingType',
  'frameMaterial',
  'installationType',
  'ventilationType',
  'generatorType'
];

/**
 * One enum table: raw DPE enum id (string) -> French label.
 */
export type EnumLabelTable = Readonly<Record<string, string>>;

/**
 * Vendored id -> French-label tables, one per {@link EnumLabelKind}.
 */
export const ENUM_LABELS: Readonly<Record<EnumLabelKind, EnumLabelTable>> = {
  "orientation": {
    "1": "sud",
    "2": "nord",
    "3": "est",
    "4": "ouest",
    "5": "horizontal"
  },
  "wallType": {
    "1": "inconnu",
    "2": "murs en pierre de taille et moellons constitué d'un seul matériaux",
    "3": "murs en pierre de taille et moellons avec remplissage tout venant",
    "4": "murs en pisé ou béton de terre stabilisé (à partir d'argile crue)",
    "5": "murs en pan de bois sans remplissage tout venant",
    "6": "murs en pan de bois avec remplissage tout venant",
    "7": "murs bois (rondin)",
    "8": "murs en briques pleines simples",
    "9": "murs en briques pleines doubles avec lame d'air",
    "10": "murs en briques creuses",
    "11": "murs en blocs de béton pleins",
    "12": "murs en blocs de béton creux",
    "13": "murs en béton banché",
    "14": "murs en béton de mâchefer",
    "15": "brique terre cuite alvéolaire",
    "16": "béton cellulaire avant 2013",
    "17": "béton cellulaire à partir de 2013",
    "18": "murs en ossature bois avec isolant en remplissage ≥ 2006",
    "19": "murs sandwich béton/isolant/béton (sans isolation rapportée)",
    "20": "cloison de plâtre",
    "21": "autre matériau traditionel ancien",
    "22": "autre matériau innovant récent",
    "23": "autre matériau non répertorié",
    "24": "murs en ossature bois avec isolant en remplissage 2001-2005",
    "25": "murs en ossature bois sans remplissage",
    "26": "murs en ossature bois avec isolant en remplissage <2001",
    "27": "murs en ossature bois avec remplissage tout venant"
  },
  "roofType": {
    "1": "inconnu",
    "2": "plafond avec ou sans remplissage",
    "3": "plafond entre solives métalliques avec ou sans remplissage",
    "4": "plafond entre solives bois avec ou sans remplissage",
    "5": "plafond bois sur solives métalliques",
    "6": "plafond bois sous solives métalliques",
    "7": "bardeaux et remplissage",
    "8": "dalle béton",
    "9": "plafond bois sur solives bois",
    "10": "plafond bois sous solives bois",
    "11": "plafond lourd type entrevous terre-cuite, poutrelles béton",
    "12": "combles aménagés sous rampant",
    "13": "toiture en chaume",
    "14": "plafond en plaque de plâtre",
    "15": "autre type de plafond non répertorié",
    "16": "toitures en bac acier"
  },
  "floorType": {
    "1": "inconnu",
    "2": "plancher avec ou sans remplissage",
    "3": "plancher entre solives métalliques avec ou sans remplissage",
    "4": "plancher entre solives bois avec ou sans remplissage",
    "5": "plancher bois sur solives métalliques",
    "6": "bardeaux et remplissage",
    "7": "voutains sur solives métalliques",
    "8": "voutains en briques ou moellons",
    "9": "dalle béton",
    "10": "plancher bois sur solives bois",
    "11": "plancher lourd type entrevous terre-cuite, poutrelles béton",
    "12": "plancher à entrevous isolant",
    "13": "autre type de plancher non répertorié"
  },
  "adjacencyType": {
    "1": "extérieur",
    "2": "paroi enterrée",
    "3": "vide sanitaire",
    "4": "bâtiment ou local à usage autre que d'habitation",
    "5": "terre-plein",
    "6": "sous-sol non chauffé",
    "7": "locaux non chauffés non accessible",
    "8": "garage",
    "9": "cellier",
    "10": "espace tampon solarisé (véranda,loggia fermée)",
    "11": "comble fortement ventilé",
    "12": "comble faiblement ventilé",
    "13": "comble très faiblement ventilé",
    "14": "circulation sans ouverture directe sur l'extérieur",
    "15": "circulation avec ouverture directe sur l'extérieur",
    "16": "circulation avec bouche ou gaine de désenfumage ouverte en permanence",
    "17": "hall d'entrée avec dispositif de fermeture automatique",
    "18": "hall d'entrée sans dispositif de fermeture automatique",
    "19": "garage privé collectif",
    "20": "local tertiaire à l'intérieur de l'immeuble en contact avec l'appartement",
    "21": "autres dépendances",
    "22": "local non déperditif ( local à usage d'habitation chauffé)"
  },
  "glazingType": {
    "1": "simple vitrage",
    "2": "double vitrage",
    "3": "triple vitrage",
    "4": "survitrage",
    "5": "brique de verre",
    "6": "polycarbonate"
  },
  "frameMaterial": {
    "1": "brique de verre",
    "2": "polycarbonate",
    "3": "bois",
    "4": "bois/métal",
    "5": "pvc",
    "6": "métal avec rupture de pont thermique",
    "7": "métal sans rupture de pont thermique"
  },
  "installationType": {
    "1": "installation individuelle",
    "2": "installation collective",
    "3": "installation collective multi-bâtiment : modélisée comme un réseau de chaleur",
    "4": "installation hybride collective-individuelle (chauffage base + appoint individuel ou convecteur bi-jonction)"
  },
  "ventilationType": {
    "1": "ventilation par ouverture des fenêtres",
    "2": "ventilation par entrées d'air hautes et basses",
    "3": "vmc sf auto réglable avant 1982",
    "4": "vmc sf auto réglable de 1982 à 2000",
    "5": "vmc sf auto réglable de 2001 à 2012",
    "6": "vmc sf auto réglable après 2012",
    "7": "vmc sf hygro a avant 2001",
    "8": "vmc sf hygro a de 2001 à 2012",
    "9": "vmc sf hygro a après 2012",
    "10": "vmc sf gaz avant  2001",
    "11": "vmc sf gaz de 2001 à 2012",
    "12": "vmc sf gaz après 2012",
    "13": "vmc sf hygro b avant  2001",
    "14": "vmc sf hygro b de 2001 à 2012",
    "15": "vmc sf hygro b après 2012",
    "16": "vmc basse pression auto-réglable",
    "17": "vmc basse pression hygro a",
    "18": "vmc basse pression hygro b",
    "19": "vmc df individuelle avec échangeur avant 2013",
    "20": "vmc df individuelle avec échangeur à partir de 2013",
    "21": "vmc df collective avec échangeur avant 2013",
    "22": "vmc df collective avec échangeur à partir de 2013",
    "23": "vmc df sans échangeur avant 2013",
    "24": "vmc df sans échangeur après 2012",
    "25": "ventilation naturelle par conduit",
    "26": "ventilation hybride avant  2001",
    "27": "ventilation hybride de 2001 à 2012",
    "28": "ventilation hybride après 2012",
    "29": "ventilation hybride avec entrées d'air hygro avant  2001",
    "30": "ventilation hybride avec entrées d'air hygro de 2001 à 2012",
    "31": "ventilation hybride avec entrées d'air hygro après 2012",
    "32": "ventilation mécanique sur conduit existant avant 2013",
    "33": "ventilation mécanique sur conduit existant à partir de 2013",
    "34": "ventilation naturelle par conduit avec entrées d'air hygro",
    "35": "puits climatique sans échangeur avant 2013",
    "36": "puits climatique sans échangeur à partir de 2013",
    "37": "puits climatique avec échangeur avant 2013",
    "38": "puits climatique avec échangeur à partir de 2013"
  },
  "generatorType": {
    "1": "pac air/air installée avant 2008",
    "2": "pac air/air installée entre 2008 et 2014",
    "3": "pac air/air installée à partir de 2015",
    "4": "pac air/eau installée avant 2008",
    "5": "pac air/eau installée entre 2008 et 2014",
    "6": "pac air/eau installée entre 2015 et 2016",
    "7": "pac air/eau installée après 2017",
    "8": "pac eau/eau installée avant 2008",
    "9": "pac eau/eau installée entre 2008 et 2014",
    "10": "pac eau/eau installée entre 2015 et 2016",
    "11": "pac eau/eau installée après 2017",
    "12": "pac eau glycolée/eau installée avant 2008",
    "13": "pac eau glycolée/eau installée entre 2008 et 2014",
    "14": "pac eau glycolée/eau installée entre 2015 et 2016",
    "15": "pac eau glycolée/eau installée après 2017",
    "16": "pac géothermique installée avant 2008",
    "17": "pac géothermique installée entre 2008 et 2014",
    "18": "pac géothermique installée entre 2015 et 2016",
    "19": "pac géothermique installée après 2017",
    "20": "cuisinière installé avant 1990",
    "21": "foyer fermé installé avant 1990",
    "22": "poêle bûche installé avant 1990",
    "23": "insert installé avant 1990",
    "24": "cuisinière installé entre 1990 et 2004",
    "25": "foyer fermé installé entre 1990 et 2004",
    "26": "poêle bûche installé entre 1990 et 2004",
    "27": "insert installé entre 1990 et 2004",
    "28": "cuisinière installé à partir de 2005 sans label flamme verte",
    "29": "foyer fermé installé à partir de 2005 sans label flamme verte",
    "30": "poêle bûche installé à partir de 2005 sans label flamme verte",
    "31": "insert installé à partir de 2005 sans label flamme verte",
    "32": "cuisinière installé installé de 2005 à 2006 avec label flamme verte",
    "33": "foyer fermé installé installé de 2005 à 2006 avec label flamme verte",
    "34": "poêle bûche installé installé de 2005 à 2006 avec label flamme verte",
    "35": "insert installé installé de 2005 à 2006 avec label flamme verte",
    "36": "cuisinière installé installé de 2007 à 2017 avec label flamme verte",
    "37": "foyer fermé installé installé de 2007 à 2017 avec label flamme verte",
    "38": "poêle bûche installé installé de 2007 à 2017 avec label flamme verte",
    "39": "insert installé installé de 2007 à 2017 avec label flamme verte",
    "40": "cuisinière installé installé à partir de 2018 avec label flamme verte",
    "41": "foyer fermé installé installé à partir de 2018 avec label flamme verte",
    "42": "poêle bûche installé installé à partir de 2018 avec label flamme verte",
    "43": "insert installé installé à partir de 2018 avec label flamme verte",
    "44": "poêle à granulés installée avant 2012 ou sans label flamme verte",
    "45": "poêle à granulés flamme verte installé entre 2012 et 2019",
    "46": "poêle à granulés flamme verte installé à partir de 2020",
    "47": "poêle fioul ou gpl ou charbon",
    "48": "poêle à bois bouilleur bûche installé avant 2012",
    "49": "poêle à bois bouilleur bûche installé à partir de 2012",
    "50": "générateur à air chaud à combustion avant 2006",
    "51": "générateur à air chaud à combustion standard a partir de 2006",
    "52": "générateur à air chaud à combustion à condensation a partir de 2006",
    "53": "radiateur à gaz indépendant ou autonome avant 2006",
    "54": "radiateur à gaz indépendant ou autonome après 2006",
    "55": "chaudière bois bûche avant 1978",
    "56": "chaudière bois bûche 1978-1994",
    "57": "chaudière bois bûche 1995-2003",
    "58": "chaudière bois bûche 2004-2012",
    "59": "chaudière bois bûche 2013-2017",
    "60": "chaudière bois bûche 2018-2019",
    "61": "chaudière bois bûche après 2019",
    "62": "chaudière bois plaquette avant 1978",
    "63": "chaudière bois plaquette 1978-1994",
    "64": "chaudière bois plaquette 1995-2003",
    "65": "chaudière bois plaquette 2004-2012",
    "66": "chaudière bois plaquette 2013-2017",
    "67": "chaudière bois plaquette 2018-2019",
    "68": "chaudière bois plaquette après 2019",
    "69": "chaudière bois granulés avant 1978",
    "70": "chaudière bois granulés 1978-1994",
    "71": "chaudière bois granulés 1995-2003",
    "72": "chaudière bois granulés 2004-2012",
    "73": "chaudière bois granulés 2013-2019",
    "74": "chaudière bois granulés après 2019",
    "75": "chaudière fioul classique avant 1970",
    "76": "chaudière fioul classique 1970-1975",
    "77": "chaudière fioul classique 1976-1980",
    "78": "chaudière fioul classique 1981-1990",
    "79": "chaudière fioul standard 1991-2015",
    "80": "chaudière fioul standard après 2015",
    "81": "chaudière fioul basse température 1991-2015",
    "82": "chaudière fioul basse température après 2015",
    "83": "chaudière fioul à condensation 1996-2015",
    "84": "chaudière fioul à condensation après 2015",
    "85": "chaudière gaz classique avant 1981",
    "86": "chaudière gaz classique 1981-1985",
    "87": "chaudière gaz classique 1986-1990",
    "88": "chaudière gaz standard 1991-2000",
    "89": "chaudière gaz standard 2001-2015",
    "90": "chaudière gaz standard après 2015",
    "91": "chaudière gaz basse température 1991-2000",
    "92": "chaudière gaz basse température 2001-2015",
    "93": "chaudière gaz basse température après 2015",
    "94": "chaudière gaz à condensation 1981-1985",
    "95": "chaudière gaz à condensation 1986-2000",
    "96": "chaudière gaz à condensation 2001-2015",
    "97": "chaudière gaz à condensation après 2015",
    "98": "convecteur électrique nfc, nf** et nf***",
    "99": "panneau rayonnant électrique nfc, nf** et nf***",
    "100": "radiateur électrique nfc, nf** et nf***",
    "101": "autres émetteurs à effet joule",
    "102": "plancher ou plafond rayonnant électrique avec régulation terminale",
    "103": "plancher ou plafond rayonnant électrique sans régulation terminale",
    "104": "radiateur électrique à accumulation",
    "105": "convecteur bi-jonction",
    "106": "chaudière électrique",
    "107": "réseau de chaleur non isolé",
    "108": "réseau de chaleur isolé",
    "109": "chaudière(s) bois multi bâtiment modélisée comme un réseau de chaleur",
    "110": "chaudière(s) fioul multi bâtiment modélisée comme un réseau de chaleur",
    "111": "chaudière(s) gaz multi bâtiment modélisée comme un réseau de chaleur",
    "112": "pompe(s) à chaleur multi bâtiment modélisée comme un réseau de chaleur",
    "113": "autre système à combustion gaz",
    "114": "autre système à combustion fioul",
    "115": "autre système à combustion bois",
    "116": "autre système à combustion autres energies fossiles (charbon,pétrole etc…)",
    "117": "autre système thermodynamique électrique",
    "118": "autre système thermodynamique gaz",
    "119": "système collectif par défaut en abscence d'information : chaudière fioul pénalisante",
    "120": "chaudière charbon avant 1978",
    "121": "chaudière charbon 1978-1994",
    "122": "chaudière charbon 1995-2003",
    "123": "chaudière charbon 2004-2012",
    "124": "chaudière charbon 2013-2017",
    "125": "chaudière charbon 2018-2019",
    "126": "chaudière charbon après 2019",
    "127": "chaudière gpl/propane/butane classique avant 1981",
    "128": "chaudière gpl/propane/butane classique 1981-1985",
    "129": "chaudière gpl/propane/butane classique 1986-1990",
    "130": "chaudière gpl/propane/butane standard 1991-2000",
    "131": "chaudière gpl/propane/butane standard 2001-2015",
    "132": "chaudière gpl/propane/butane standard après 2015",
    "133": "chaudière gpl/propane/butane basse température 1991-2000",
    "134": "chaudière gpl/propane/butane basse température 2001-2015",
    "135": "chaudière gpl/propane/butane basse température après 2015",
    "136": "chaudière gpl/propane/butane à condensation 1981-1985",
    "137": "chaudière gpl/propane/butane à condensation 1986-2000",
    "138": "chaudière gpl/propane/butane à condensation 2001-2015",
    "139": "chaudière gpl/propane/butane à condensation après 2015",
    "140": "poêle à bois bouilleur granulés installé avant 2012",
    "141": "poêle à bois bouilleur granulés installé à partir de 2012",
    "142": "réseau de chaleur non répertorié ou inconnu",
    "143": "pompe à chaleur hybride : partie pompe à chaleur (supprime)",
    "144": "pompe à chaleur hybride : partie chaudière (supprime)",
    "145": "pompe à chaleur hybride : partie pompe à chaleur pac air/eau installée entre 2008 et 2014",
    "146": "pompe à chaleur hybride : partie pompe à chaleur pac air/eau installée entre 2015 et 2016",
    "147": "pompe à chaleur hybride : partie pompe à chaleur pac air/eau installée après 2017",
    "148": "pompe à chaleur hybride : partie chaudière chaudière gaz à condensation 2001-2015",
    "149": "pompe à chaleur hybride : partie chaudière chaudière gaz à condensation après 2015",
    "150": "pompe à chaleur hybride : partie chaudière chaudière fioul à condensation 1996-2015",
    "151": "pompe à chaleur hybride : partie chaudière chaudière fioul à condensation après 2015",
    "152": "pompe à chaleur hybride : partie chaudière chaudière bois granulés 2013-2019",
    "153": "pompe à chaleur hybride : partie chaudière chaudière bois granulés après 2019",
    "154": "pompe à chaleur hybride : partie chaudière chaudière bois bûche 2013-2017",
    "155": "pompe à chaleur hybride : partie chaudière chaudière bois bûche 2018-2019",
    "156": "pompe à chaleur hybride : partie chaudière chaudière bois bûche après 2019",
    "157": "pompe à chaleur hybride : partie chaudière chaudière bois plaquette 2013-2017",
    "158": "pompe à chaleur hybride : partie chaudière chaudière bois plaquette 2018-2019",
    "159": "pompe à chaleur hybride : partie chaudière chaudière bois plaquette après 2019",
    "160": "pompe à chaleur hybride : partie chaudière chaudière gpl/propane/butane à condensation 2001-2015",
    "161": "pompe à chaleur hybride : partie chaudière chaudière gpl/propane/butane à condensation après 2015",
    "162": "pompe à chaleur hybride : partie pompe à chaleur pac eau/eau installée entre 2008 et 2014",
    "163": "pompe à chaleur hybride : partie pompe à chaleur pac eau/eau installée entre 2015 et 2016",
    "164": "pompe à chaleur hybride : partie pompe à chaleur pac eau/eau installée après 2017",
    "165": "pompe à chaleur hybride : partie pompe à chaleur pac eau glycolée/eau installée entre 2008 et 2014",
    "166": "pompe à chaleur hybride : partie pompe à chaleur pac eau glycolée/eau installée entre 2015 et 2016",
    "167": "pompe à chaleur hybride : partie pompe à chaleur pac eau glycolée/eau installée après 2017",
    "168": "pompe à chaleur hybride : partie pompe à chaleur pac géothermique installée entre 2008 et 2014",
    "169": "pompe à chaleur hybride : partie pompe à chaleur pac géothermique installée entre 2015 et 2016",
    "170": "pompe à chaleur hybride : partie pompe à chaleur pac géothermique installée après 2017",
    "171": "chaudière(s) charbon multi bâtiment modélisée comme un réseau de chaleur"
  }
};

/**
 * Type guard for untrusted input (e.g. the `:kind` path parameter).
 *
 * @param kind - untrusted string
 * @returns true when `kind` is one of {@link ENUM_LABEL_KINDS}
 */
export function isEnumLabelKind(kind: string): kind is EnumLabelKind {
  return (ENUM_LABEL_KINDS as readonly string[]).includes(kind);
}

/**
 * Looks up the French label of one enum id. Unknown ids return `null` —
 * callers must show the raw id with an honest "unknown" flag, never guess.
 *
 * @param kind - enum kind
 * @param id - raw enum id as sent in `building.*.update.v1` commands
 * @returns the French label, or `null` when the id is not in the table
 */
export function enumLabel(kind: EnumLabelKind, id: string): string | null {
  return ENUM_LABELS[kind][id] ?? null;
}
