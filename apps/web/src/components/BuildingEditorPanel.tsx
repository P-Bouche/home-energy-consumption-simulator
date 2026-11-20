import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  TextField,
  Typography
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import UndoIcon from '@mui/icons-material/Undo';
import { useEditorStore } from '../store/editor-store.ts';
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
      { field: 'uValueWm2K', label: 'U (W/m².K)', numeric: true },
      { field: 'areaM2', label: 'Surface (m²)', numeric: true },
      { field: 'description', label: 'Description', numeric: false },
      { field: 'orientation', label: 'Orientation (enum id)', numeric: false },
      { field: 'wallType', label: 'Type de mur (enum id)', numeric: false },
      { field: 'adjacencyType', label: 'Adjacence (enum id)', numeric: false }
    ]
  },
  window: {
    tag: 'building.window.update.v1',
    idField: 'windowId',
    label: 'Fenêtre',
    fields: [
      { field: 'uValueWm2K', label: 'Uw (W/m².K)', numeric: true },
      { field: 'areaM2', label: 'Surface (m²)', numeric: true },
      { field: 'description', label: 'Description', numeric: false },
      { field: 'orientation', label: 'Orientation (enum id)', numeric: false },
      { field: 'count', label: 'Nombre', numeric: true },
      { field: 'solarFactorSw', label: 'Facteur solaire Sw', numeric: true },
      { field: 'glazingType', label: 'Vitrage (enum id)', numeric: false },
      { field: 'frameMaterial', label: 'Menuiserie (enum id)', numeric: false }
    ]
  },
  roof: {
    tag: 'building.roof.update.v1',
    idField: 'roofId',
    label: 'Toiture / plancher haut',
    fields: [
      { field: 'uValueWm2K', label: 'U (W/m².K)', numeric: true },
      { field: 'areaM2', label: 'Surface (m²)', numeric: true },
      { field: 'description', label: 'Description', numeric: false },
      { field: 'roofType', label: 'Type (enum id)', numeric: false },
      { field: 'adjacencyType', label: 'Adjacence (enum id)', numeric: false }
    ]
  },
  floor: {
    tag: 'building.floor.update.v1',
    idField: 'floorId',
    label: 'Plancher bas',
    fields: [
      { field: 'uValueWm2K', label: 'U (W/m².K)', numeric: true },
      { field: 'areaM2', label: 'Surface (m²)', numeric: true },
      { field: 'description', label: 'Description', numeric: false },
      { field: 'floorType', label: 'Type (enum id)', numeric: false },
      { field: 'adjacencyType', label: 'Adjacence (enum id)', numeric: false }
    ]
  },
  'heating-system': {
    tag: 'building.heating-system.update.v1',
    idField: 'systemId',
    label: 'Chauffage',
    fields: [
      { field: 'description', label: 'Description', numeric: false },
      { field: 'installationType', label: 'Type d’installation (enum id)', numeric: false },
      { field: 'heatedAreaM2', label: 'Surface chauffée (m²)', numeric: true }
    ]
  },
  'ventilation-system': {
    tag: 'building.ventilation-system.update.v1',
    idField: 'systemId',
    label: 'Ventilation',
    fields: [
      { field: 'description', label: 'Description', numeric: false },
      { field: 'ventilationType', label: 'Type de ventilation (enum id)', numeric: false },
      { field: 'ventilatedAreaM2', label: 'Surface ventilée (m²)', numeric: true },
      { field: 'q4paConv', label: 'q4pa conv (m³/h.m²)', numeric: true }
    ]
  }
};

interface EditTarget {
  readonly kind: EditableKind;
  readonly id: string;
  readonly element: Record<string, unknown>;
}

function confidenceChip(c: ConfidenceJson<unknown> | null | undefined): React.ReactElement {
  if (c === null || c === undefined) {
    return <Chip size="small" label="absent" variant="outlined" />;
  }
  const isUser = c.source === 'user';
  return (
    <Chip
      size="small"
      data-testid={`source-${isUser ? 'user' : 'dpe'}-${String(c.value)}`}
      label={isUser ? `utilisateur (confiance ${c.confidence})` : `DPE (confiance ${c.confidence})`}
      color={isUser ? 'success' : 'default'}
      variant={isUser ? 'filled' : 'outlined'}
    />
  );
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

  const [target, setTarget] = useState<EditTarget | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

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
  };

  const closeEditor = (): void => {
    setTarget(null);
    setForm({});
    setFormError(null);
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
        const num = Number(raw);
        if (Number.isNaN(num)) {
          setFormError(`${f.label} doit être un nombre`);
          return;
        }
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
  ): React.ReactElement => (
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
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {confidenceChip(element['uValueWm2K'] as ConfidenceJson<number> | null)}
            {confidenceChip(element['areaM2'] as ConfidenceJson<number> | null)}
          </Box>
        }
      />
    </ListItem>
  );

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
      <Typography variant="subtitle1">Piste d’audit</Typography>
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

      <Dialog open={target !== null} onClose={closeEditor} fullWidth maxWidth="sm">
        <DialogTitle>
          {target !== null ? `Modifier — ${KINDS[target.kind].label} ${target.id}` : ''}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {target !== null &&
            KINDS[target.kind].fields.map((f) => (
              <TextField
                key={f.field}
                label={f.label}
                type={f.numeric ? 'number' : 'text'}
                value={form[f.field] ?? ''}
                slotProps={{ htmlInput: { 'data-testid': `field-${f.field}` } }}
                error={(fieldErrors[f.field]?.length ?? 0) > 0}
                helperText={fieldErrors[f.field]?.join(' ; ') ?? ' '}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.field]: e.target.value }))}
              />
            ))}
          {formError !== null && (
            <Alert severity="error" data-testid="form-error">
              {formError}
            </Alert>
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
