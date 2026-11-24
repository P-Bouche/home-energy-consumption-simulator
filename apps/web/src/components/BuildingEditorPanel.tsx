import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UndoIcon from '@mui/icons-material/Undo';
import { useEditorStore } from '../store/editor-store.ts';
import { useSimulationStore } from '../store/simulation-store.ts';
import { useEnumLabels } from '../hooks/use-enum-labels.ts';
import { ENUM_KINDS, enumOptions, resolveEnumLabel, type EnumLabelKind } from '../services/enum-labels.ts';
import { describeQ4pa, describeSw, describeU } from '../services/u-reading.ts';
import { translateFieldError } from '../services/error-messages.ts';
import { previousResult } from '../services/edit-impact.ts';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';
import { ImpactSummary } from './ImpactSummary.tsx';
import type {
  AuditEntryJson,
  BuildingCommandJson,
  ConfidenceJson,
  FieldChangeJson
} from '../types.ts';

type EditableKind = 'wall' | 'window' | 'roof' | 'floor' | 'heating-system' | 'ventilation-system';

interface FieldDef {
  readonly field: string;
  readonly label: string;
  readonly numeric: boolean;
  /** enum fields render as a labeled select; the raw id is still what gets sent */
  readonly enumKind?: EnumLabelKind;
  /**
   * Min/max shown on numeric inputs. Presentation data only — mirrors the
   * domain invariants `U_VALUE_MAX` etc.; the domain remains the enforcing
   * layer (400 fieldErrors). U range is (0, 4] W/m².K: 0 is exclusive.
   */
  readonly min?: number;
  readonly max?: number;
  /** plain-language example promoted from the catalog description into helper text */
  readonly helper?: string;
  /** noun + gender for the plain-language reading of the U value */
  readonly uNoun?: { readonly noun: string; readonly gender: 'm' | 'f' };
  /** plain-language reading for non-U numeric fields (Sw, q4pa) */
  readonly reading?: 'sw' | 'q4pa';
}

interface KindDef {
  readonly tag: BuildingCommandJson['type'];
  readonly idField: string;
  readonly label: string;
  readonly fields: readonly FieldDef[];
}

const KINDS: Record<EditableKind, KindDef> = {
  wall: {
    tag: 'building.wall.update.v1',
    idField: 'wallId',
    label: 'Mur',
    fields: [
      { field: 'uValueWm2K', label: 'U (W/m².K)', numeric: true, min: 0, max: 4, helper: 'ex. 0,2 pour une isolation par l’extérieur', uNoun: { noun: 'mur', gender: 'm' } },
      { field: 'areaM2', label: 'Surface (m²)', numeric: true },
      { field: 'description', label: 'Description', numeric: false },
      { field: 'orientation', label: 'Orientation', numeric: false, enumKind: 'orientation' },
      { field: 'wallType', label: 'Type de mur', numeric: false, enumKind: 'wallType' },
      { field: 'adjacencyType', label: 'Adjacence', numeric: false, enumKind: 'adjacencyType' }
    ]
  },
  window: {
    tag: 'building.window.update.v1',
    idField: 'windowId',
    label: 'Fenêtre',
    fields: [
      { field: 'uValueWm2K', label: 'Uw (W/m².K)', numeric: true, min: 0, max: 4, helper: 'ex. 1,1 pour du double vitrage récent', uNoun: { noun: 'baie vitrée', gender: 'f' } },
      { field: 'areaM2', label: 'Surface (m²)', numeric: true },
      { field: 'description', label: 'Description', numeric: false },
      { field: 'orientation', label: 'Orientation', numeric: false, enumKind: 'orientation' },
      { field: 'count', label: 'Nombre', numeric: true },
      { field: 'solarFactorSw', label: 'Facteur solaire Sw', numeric: true, reading: 'sw' },
      { field: 'glazingType', label: 'Vitrage', numeric: false, enumKind: 'glazingType' },
      { field: 'frameMaterial', label: 'Menuiserie', numeric: false, enumKind: 'frameMaterial' }
    ]
  },
  roof: {
    tag: 'building.roof.update.v1',
    idField: 'roofId',
    label: 'Toiture / plancher haut',
    fields: [
      { field: 'uValueWm2K', label: 'U (W/m².K)', numeric: true, min: 0, max: 4, uNoun: { noun: 'toiture', gender: 'f' } },
      { field: 'areaM2', label: 'Surface (m²)', numeric: true },
      { field: 'description', label: 'Description', numeric: false },
      { field: 'roofType', label: 'Type de toiture', numeric: false, enumKind: 'roofType' },
      { field: 'adjacencyType', label: 'Adjacence', numeric: false, enumKind: 'adjacencyType' }
    ]
  },
  floor: {
    tag: 'building.floor.update.v1',
    idField: 'floorId',
    label: 'Plancher bas',
    fields: [
      { field: 'uValueWm2K', label: 'U (W/m².K)', numeric: true, min: 0, max: 4, uNoun: { noun: 'plancher', gender: 'm' } },
      { field: 'areaM2', label: 'Surface (m²)', numeric: true },
      { field: 'description', label: 'Description', numeric: false },
      { field: 'floorType', label: 'Type de plancher', numeric: false, enumKind: 'floorType' },
      { field: 'adjacencyType', label: 'Adjacence', numeric: false, enumKind: 'adjacencyType' }
    ]
  },
  'heating-system': {
    tag: 'building.heating-system.update.v1',
    idField: 'systemId',
    label: 'Chauffage',
    fields: [
      { field: 'description', label: 'Description', numeric: false },
      { field: 'installationType', label: 'Type d’installation', numeric: false, enumKind: 'installationType' },
      { field: 'heatedAreaM2', label: 'Surface chauffée (m²)', numeric: true }
    ]
  },
  'ventilation-system': {
    tag: 'building.ventilation-system.update.v1',
    idField: 'systemId',
    label: 'Ventilation',
    fields: [
      { field: 'description', label: 'Description', numeric: false },
      { field: 'ventilationType', label: 'Type de ventilation', numeric: false, enumKind: 'ventilationType' },
      { field: 'ventilatedAreaM2', label: 'Surface ventilée (m²)', numeric: true },
      { field: 'q4paConv', label: 'q4pa conv (m³/h.m²)', numeric: true, reading: 'q4pa' }
    ]
  }
};

interface EditTarget {
  readonly kind: EditableKind;
  readonly id: string;
  readonly element: Record<string, unknown>;
}

/**
 * The value whose provenance is shown on an element row (US 7 / F6): the
 * U-value when the element has one, else the area, else the description —
 * one plain-word badge per row instead of raw chips repeated everywhere; the
 * Synthèse tab aggregates the estimated values.
 */
function primaryConfidence(element: Record<string, unknown>): ConfidenceJson<unknown> | null {
  for (const field of ['uValueWm2K', 'areaM2', 'heatedAreaM2', 'ventilatedAreaM2', 'q4paConv', 'description']) {
    const c = element[field] as ConfidenceJson<unknown> | null | undefined;
    if (c !== null && c !== undefined) return c;
  }
  return null;
}

function formatChange(change: FieldChangeJson): string {
  const fmt = (c: ConfidenceJson<unknown> | null): string =>
    c === null ? '∅' : `${String(c.value)} [${c.source}, confiance ${c.confidence}]`;
  return `${change.field} : ${fmt(change.oldValue)} → ${fmt(change.newValue)}`;
}

/**
 * P4 2D editor panel: element list → edit form (MUI dialog) → save → the
 * store re-runs the P2 simulation; plus undo and the audit view.
 * Presentation only: all flow lives in the editor store.
 */
export function BuildingEditorPanel({ buildingId }: { readonly buildingId: string }) {
  const building = useEditorStore((s) => s.building);
  const version = useEditorStore((s) => s.version);
  const audit = useEditorStore((s) => s.audit);
  const status = useEditorStore((s) => s.status);
  const error = useEditorStore((s) => s.error);
  const conflict = useEditorStore((s) => s.conflict);
  const fieldErrors = useEditorStore((s) => s.fieldErrors);
  const load = useEditorStore((s) => s.load);
  const save = useEditorStore((s) => s.save);
  const undo = useEditorStore((s) => s.undo);
  const simResult = useSimulationStore((s) => s.result);
  const simHistory = useSimulationStore((s) => s.history);
  const simStatus = useSimulationStore((s) => s.status);

  const [target, setTarget] = useState<EditTarget | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const enumTables = useEnumLabels(ENUM_KINDS);

  useEffect(() => {
    void load(buildingId);
  }, [buildingId, load]);

  const openEditor = (kind: EditableKind, id: string, element: Record<string, unknown>): void => {
    const def = KINDS[kind];
    const initial: Record<string, string> = {};
    for (const f of def.fields) {
      const raw = element[f.field] as ConfidenceJson<unknown> | null | undefined;
      initial[f.field] = raw === null || raw === undefined ? '' : String(raw.value);
    }
    setTarget({ kind, id, element });
    setForm(initial);
    setFormError(null);
    setShowTechnical(false);
  };

  const closeEditor = (): void => {
    setTarget(null);
    setForm({});
    setFormError(null);
    setShowTechnical(false);
  };

  const onSave = async (): Promise<void> => {
    if (target === null || building === null) return;
    const def = KINDS[target.kind];
    const command: Record<string, unknown> = {
      type: def.tag,
      buildingId: building.id,
      [def.idField]: target.id
    };
    for (const f of def.fields) {
      const raw = (form[f.field] ?? '').trim();
      if (raw === '') continue;
      if (f.numeric) {
        let num = Number(raw);
        if (Number.isNaN(num)) {
          setFormError(`${f.label} doit être un nombre`);
          return;
        }
        // Clamp the upper bound only: manual input must not bypass the slider
        // max (issue #48 finding 1: Uw typed above 4). The lower bound stays
        // domain-enforced — invalid values are sent raw and rejected with a
        // field-level 400 (AC-P4-02 frozen contract).
        if (f.max !== undefined && num > f.max) num = f.max;
        command[f.field] = num;
      } else {
        command[f.field] = raw;
      }
    }
    setFormError(null);
    const ok = await save(command as unknown as BuildingCommandJson);
    if (ok) closeEditor();
  };

  const renderRow = (
    kind: EditableKind,
    id: string,
    element: Record<string, unknown>,
    summary: string
  ): React.ReactElement => {
    const primary = primaryConfidence(element);
    return (
      <ListItem
        key={`${kind}-${id}`}
        secondaryAction={
          <Button size="small" startIcon={<EditIcon />} data-testid={`edit-${kind}-${id}`} onClick={() => openEditor(kind, id, element)}>
            Modifier
          </Button>
        }
      >
        <ListItemText
          primary={`${KINDS[kind].label} ${id} — ${summary}`}
          secondary={
            primary === null ? null : (
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                <ConfidenceBadge
                  value={primary}
                  testId={`source-${primary.source === 'user' ? 'user' : 'dpe'}-${String(primary.value)}`}
                />
              </Box>
            )
          }
        />
      </ListItem>
    );
  };

  const groups: { title: string; items: React.ReactElement[] }[] = building === null ? [] : [
    {
      title: 'Murs',
      items: building.walls.map((w) =>
        renderRow('wall', w.id, w as unknown as Record<string, unknown>, `${w.description.value} · U=${w.uValueWm2K?.value ?? '—'} · ${w.areaM2?.value ?? '—'} m²`)
      )
    },
    {
      title: 'Fenêtres',
      items: building.windows.map((w) =>
        renderRow('window', w.id, w as unknown as Record<string, unknown>, `${w.description.value} · Uw=${w.uValueWm2K?.value ?? '—'} · ${w.areaM2?.value ?? '—'} m²`)
      )
    },
    {
      title: 'Toitures / planchers hauts',
      items: building.roofs.map((r) =>
        renderRow('roof', r.id, r as unknown as Record<string, unknown>, `${r.description.value} · U=${r.uValueWm2K?.value ?? '—'} · ${r.areaM2?.value ?? '—'} m²`)
      )
    },
    {
      title: 'Planchers bas',
      items: building.floors.map((f) =>
        renderRow('floor', f.id, f as unknown as Record<string, unknown>, `${f.description.value} · U=${f.uValueWm2K?.value ?? '—'} · ${f.areaM2?.value ?? '—'} m²`)
      )
    },
    {
      title: 'Chauffage',
      items: building.heatingSystems.map((h) =>
        renderRow('heating-system', h.id, h as unknown as Record<string, unknown>, `${h.description.value} · surface chauffée ${h.heatedAreaM2?.value ?? '—'} m²`)
      )
    },
    {
      title: 'Ventilation',
      items: building.ventilationSystems.map((v) =>
        renderRow('ventilation-system', v.id, v as unknown as Record<string, unknown>, `${v.description.value} · q4pa=${v.q4paConv?.value ?? '—'}`)
      )
    }
  ];

  /** French subject used in translated validation messages ("U" vs "Uw" for windows) */
  const fieldSubject = (f: FieldDef): string | undefined =>
    f.field === 'uValueWm2K' ? (f.label.startsWith('Uw') ? 'Uw' : 'U') : undefined;

  /**
   * Renders one dialog field: enum fields as a labeled select (French label
   * first, raw id secondary, unknown ids flagged honestly), U fields as a
   * bounded numeric input with a plain-language reading, other fields as
   * plain inputs. Validation messages are translated at render time only —
   * the raw API message stays in the store and in the technical expander.
   */
  const renderField = (f: FieldDef): React.ReactElement => {
    const value = form[f.field] ?? '';
    const rawErrors = fieldErrors[f.field] ?? [];
    const frenchErrors = rawErrors.map((m) => translateFieldError(f.field, m, fieldSubject(f)).french);
    if (f.enumKind !== undefined) {
      const table = enumTables[f.enumKind] ?? null;
      const options = enumOptions(table, value);
      const resolved = resolveEnumLabel(table, value);
      return (
        <FormControl key={f.field} fullWidth error={rawErrors.length > 0} data-testid={`field-${f.field}`}>
          <InputLabel>{f.label}</InputLabel>
          <Select
            label={f.label}
            value={value}
            onChange={(e) => setForm((prev) => ({ ...prev, [f.field]: String(e.target.value) }))}
          >
            <MenuItem value="" disabled>
              Non modifié
            </MenuItem>
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                <ListItemText
                  primary={o.label}
                  secondary={o.known ? `id ${o.id}` : `id ${o.id} — inconnu de la table DPE (envoyé tel quel)`}
                />
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {rawErrors.length > 0
              ? frenchErrors.join(' ; ')
              : value === ''
                ? ' '
                : resolved.known
                  ? `Valeur envoyée : id ${value}`
                  : `id ${value} inconnu — envoyé tel quel`}
          </FormHelperText>
        </FormControl>
      );
    }
    const typedNum = value.trim() === '' ? Number.NaN : Number(value);
    const currentRaw = target?.element[f.field] as ConfidenceJson<unknown> | null | undefined;
    const current = currentRaw === null || currentRaw === undefined ? '' : String(currentRaw.value);
    // Empty field -> reading of the current stored value; typed value -> reading
    // of exactly what was typed (typing 0 must not fall back to the old value).
    const effective = value.trim() === '' ? Number(current) : typedNum;
    const uKind = target?.kind === 'window' ? 'window' : 'wall';
    const reading =
      f.uNoun !== undefined && Number.isFinite(effective) && effective > 0
        ? describeU(effective, f.uNoun.noun, f.uNoun.gender, uKind)
        : f.reading === 'sw' && Number.isFinite(effective)
          ? describeSw(effective)
          : f.reading === 'q4pa' && Number.isFinite(effective)
            ? describeQ4pa(effective)
            : '';
    const helperText = rawErrors.length > 0 ? frenchErrors.join(' ; ') : [reading, f.helper].filter((p) => p !== '').join(' · ') || ' ';
    return (
      <TextField
        key={f.field}
        label={f.label}
        type={f.numeric ? 'number' : 'text'}
        value={value}
        fullWidth
        slotProps={{
          htmlInput: {
            'data-testid': `field-${f.field}`,
            ...(f.min !== undefined ? { min: f.min } : {}),
            ...(f.max !== undefined ? { max: f.max } : {})
          }
        }}
        error={rawErrors.length > 0}
        helperText={helperText}
        onChange={(e) => setForm((prev) => ({ ...prev, [f.field]: e.target.value }))}
      />
    );
  };

  const hasFieldErrors = Object.values(fieldErrors).some((messages) => messages.length > 0);

  /** latest audit entry (history is oldest-first), drives the impact summary */
  const latestEntry: AuditEntryJson | null = audit.length > 0 ? audit[audit.length - 1] ?? null : null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3 }} data-testid="editor-panel">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2">
          Éditeur du bâtiment (2D)
        </Typography>
        <Chip label={`version ${version}`} data-testid="building-version" color="primary" variant="outlined" />
        <Button
          variant="outlined"
          startIcon={<UndoIcon />}
          data-testid="undo-button"
          disabled={audit.length === 0 || status === 'saving'}
          onClick={() => void undo()}
        >
          Annuler le dernier changement
        </Button>
      </Box>

      {/* US 4 / F4: impact of the last edit right where it happened —
          plain-language simulation delta + value diff; the raw audit trail
          stays below as opt-in technical detail */}
      {latestEntry !== null && (
        <ImpactSummary
          entry={latestEntry}
          before={previousResult(simHistory, simResult)}
          after={simResult}
          pending={simStatus === 'running' || simStatus === 'queued'}
        />
      )}

      {conflict && (
        <Alert severity="warning" sx={{ mt: 1 }} data-testid="conflict-error">
          Conflit de version : le bâtiment a été modifié ailleurs. État rechargé (version {version}), réessayez. {error}
        </Alert>
      )}
      {error !== null && !conflict && status === 'error' && (
        <Alert severity="error" sx={{ mt: 1 }} data-testid="editor-error">
          {error}
        </Alert>
      )}

      {building !== null &&
        groups.map((group) => (
          <Box key={group.title} sx={{ mt: 2 }}>
            <Typography variant="subtitle1">{group.title}</Typography>
            <List dense data-testid={`element-list-${group.title}`}>
              {group.items}
            </List>
          </Box>
        ))}

      <Divider sx={{ my: 2 }} />
      <Accordion data-testid="audit-expander">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">Piste d’audit (détail technique)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List dense data-testid="audit-list">
            {audit.length === 0 && <ListItem><ListItemText primary="Aucune modification enregistrée" /></ListItem>}
            {audit.map((entry: AuditEntryJson) => (
              <ListItem key={entry.id} data-testid="audit-entry" alignItems="flex-start">
                <ListItemText
                  primary={`${entry.commandType} · v${entry.version} · ${entry.userId} · ${new Date(entry.timestamp).toLocaleString('fr-FR')}`}
                  secondary={entry.changes.map((c) => formatChange(c)).join(' | ')}
                />
              </ListItem>
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      <Dialog open={target !== null} onClose={closeEditor} fullWidth maxWidth="sm">
        <DialogTitle>
          {target !== null ? `Modifier — ${KINDS[target.kind].label} ${target.id}` : ''}
        </DialogTitle>
        {/* Padding-top must be inline: sx/class paddings are overridden by the MUI rule
            `.MuiDialogTitle-root + .MuiDialogContent-root { padding-top: 0 }` (two-class
            specificity, see mui/material-ui#27851). The padding reserves room for the
            outlined label of the first field, which straddles the field border and
            would otherwise be clipped by the DialogContent scroll container. */}
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          style={{ paddingTop: 16 }}
        >
          {target !== null && KINDS[target.kind].fields.map((f) => renderField(f))}
          {hasFieldErrors && (
            <Accordion data-testid="raw-error-details">
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2">Message technique (tel que renvoyé par l’API)</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {Object.entries(fieldErrors).flatMap(([field, messages]) =>
                  messages.map((m) => (
                    <Typography key={`${field}:${m}`} variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {field}: {m}
                    </Typography>
                  ))
                )}
              </AccordionDetails>
            </Accordion>
          )}
          {formError !== null && (
            <Alert severity="error" data-testid="form-error">
              {formError}
            </Alert>
          )}
          {target !== null && (
            <FormControlLabel
              control={
                <Switch
                  checked={showTechnical}
                  onChange={(e) => setShowTechnical(e.target.checked)}
                  data-testid="show-technical-values"
                />
              }
              label="Afficher les valeurs techniques"
            />
          )}
          {target !== null && showTechnical && (
            <Box
              data-testid="technical-values"
              sx={{ p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}
            >
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {KINDS[target.kind].tag} · {KINDS[target.kind].idField}={target.id}
              </Typography>
              {KINDS[target.kind].fields.map((f) => (
                <Typography key={f.field} variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {f.field} = {JSON.stringify(form[f.field] ?? '')}
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditor}>Annuler</Button>
          <Button variant="contained" data-testid="save-edit" disabled={status === 'saving'} onClick={() => void onSave()}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
