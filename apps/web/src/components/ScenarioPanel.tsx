import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useScenarioStore } from '../store/scenario-store.ts';
import { buildCommand, catalogEntryFor, COMMAND_CATALOG, type CommandCatalogField } from './command-catalog.ts';
import { useEnumLabels } from '../hooks/use-enum-labels.ts';
import { ENUM_KINDS, enumOptions } from '../services/enum-labels.ts';
import { describeU } from '../services/u-reading.ts';
import {
  catalogEntryForWork,
  composeWorkCommand,
  elementOptionsForWork,
  uNounForTargetKind,
  WORK_CATALOG
} from '../services/work-catalog.ts';
import type { CommandJson, ComparisonEntryJson } from '../types.ts';

const LABEL_COLORS: Record<string, string> = {
  A: '#1a9850',
  B: '#66bd63',
  C: '#a6d96a',
  D: '#fee08b',
  E: '#fdae61',
  F: '#f46d43',
  G: '#d73027'
};

function LabelChip({ label, testId }: { readonly label: string; readonly testId: string }) {
  return (
    <Chip
      label={label}
      data-testid={testId}
      size="small"
      sx={{ backgroundColor: LABEL_COLORS[label] ?? '#999', color: '#111', fontWeight: 700 }}
    />
  );
}

function formatDelta(value: number, unit: string): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${unit}`;
}

interface CommandRow {
  readonly type: string;
  readonly targetId: string;
  readonly values: Record<string, string>;
}

/** one row of the work-first form: a named work + its target element + parameter values */
interface WorkRow {
  readonly workId: string;
  readonly targetId: string;
  readonly values: Record<string, string>;
}

/** form mode: work-first (default, UX US 10) or the raw command-row editor (advanced) */
type FormMode = 'work' | 'advanced';

const DEFAULT_WORK_ROW: WorkRow = { workId: 'wall-insulation', targetId: '', values: { uValueWm2K: '' } };
const DEFAULT_COMMAND_ROW: CommandRow = { type: 'building.wall.update.v1', targetId: '', values: { uValueWm2K: '' } };

/**
 * Scenario panel (P5 headless): scenario list + editor (command catalog) +
 * comparison table with label badges and deltas + apply. Presentation only:
 * the scenario store owns the flow.
 */
export function ScenarioPanel({ buildingId }: { readonly buildingId: string }) {
  const load = useScenarioStore((s) => s.load);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const building = useScenarioStore((s) => s.building);
  const comparison = useScenarioStore((s) => s.comparison);
  const lastSimulations = useScenarioStore((s) => s.lastSimulations);
  const lastApply = useScenarioStore((s) => s.lastApply);
  const status = useScenarioStore((s) => s.status);
  const error = useScenarioStore((s) => s.error);
  const create = useScenarioStore((s) => s.create);
  const simulate = useScenarioStore((s) => s.simulate);
  const compare = useScenarioStore((s) => s.compare);
  const apply = useScenarioStore((s) => s.apply);
  const remove = useScenarioStore((s) => s.remove);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<FormMode>('work');
  const [works, setWorks] = useState<WorkRow[]>([{ ...DEFAULT_WORK_ROW, values: { ...DEFAULT_WORK_ROW.values } }]);
  const [rows, setRows] = useState<CommandRow[]>([{ ...DEFAULT_COMMAND_ROW, values: { ...DEFAULT_COMMAND_ROW.values } }]);
  const [formError, setFormError] = useState<string | null>(null);
  // All catalog enum kinds (issue #73): the scenario form must resolve every
  // enumKind a command field declares — including generatorType — else the
  // select renders with no options. Tables are cached per kind per session.
  const enumTables = useEnumLabels(ENUM_KINDS);

  useEffect(() => {
    void load(buildingId);
  }, [buildingId, load]);

  const targetOptions = useMemo(() => {
    if (building === null) return {};
    return {
      walls: building.walls,
      roofs: building.roofs,
      floors: building.floors,
      windows: building.windows,
      heatingSystems: building.heatingSystems,
      ventilationSystems: building.ventilationSystems
    };
  }, [building]);

  /**
   * Renders one catalog field (shared by the work-first form and the advanced
   * command rows): enum fields as a labeled select (French label first, raw id
   * secondary; the raw id is still what `buildCommand` sends), numeric fields
   * with their min/max bounds and a plain-language U reading in the helper
   * text.
   */
  const renderCatalogField = (
    field: CommandCatalogField,
    targetKind: string,
    values: Record<string, string>,
    setValue: (next: string) => void,
    testId: string
  ): React.ReactElement => {
    const value = values[field.key] ?? '';
    if (field.enumKind !== undefined) {
      const table = enumTables[field.enumKind] ?? null;
      const options = enumOptions(table, value);
      return (
        <FormControl key={field.key} size="small" sx={{ minWidth: 220, flexShrink: 0 }} data-testid={testId}>
          <InputLabel>{field.label}</InputLabel>
          <Select label={field.label} value={value} onChange={(e) => setValue(String(e.target.value))}>
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
          <FormHelperText>{value === '' ? ' ' : `Valeur envoyée : id ${value}`}</FormHelperText>
        </FormControl>
      );
    }
    const typedNum = value.trim() === '' ? Number.NaN : Number(value);
    const noun = uNounForTargetKind(targetKind);
    const reading = Number.isFinite(typedNum) && typedNum > 0 ? describeU(typedNum, noun.noun, noun.gender) : '';
    const helper = [reading, field.helper].filter((p) => p !== undefined && p !== '').join(' · ');
    return (
      <TextField
        key={field.key}
        size="small"
        type={field.input === 'number' ? 'number' : 'text'}
        label={field.label}
        placeholder={field.placeholder}
        value={value}
        data-testid={testId}
        slotProps={{
          htmlInput: {
            ...(field.min !== undefined ? { min: field.min } : {}),
            ...(field.max !== undefined ? { max: field.max } : {})
          }
        }}
        helperText={helper === '' ? ' ' : helper}
        // issue #76: wide enough for the floating label (« Uw (W/m².K) ») and allowed to shrink,
        // so the label/helper never overlap the field in the wrapping row
        sx={{ minWidth: 200 }}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  };

  const onCreate = async (): Promise<void> => {
    setFormError(null);
    if (name.trim().length === 0) {
      setFormError('Le nom du scénario est requis.');
      return;
    }
    const commands: CommandJson[] = [];
    if (mode === 'work') {
      // work-first (US 10): each named work composes the exact same frozen
      // command as the advanced row editor (same buildCommand path)
      for (const work of works) {
        if (catalogEntryForWork(work.workId) === undefined || work.targetId === '') {
          setFormError('Chaque travail doit avoir un élément cible.');
          return;
        }
        commands.push(composeWorkCommand(work.workId, work.targetId, work.values) as CommandJson);
      }
    } else {
      for (const row of rows) {
        const entry = catalogEntryFor(row.type);
        if (entry === undefined || row.targetId === '') {
          setFormError('Chaque commande doit avoir un type et un élément cible.');
          return;
        }
        commands.push(buildCommand(entry, row.targetId, row.values));
      }
    }
    try {
      await create({ name: name.trim(), description: description.trim(), commands });
      setName('');
      setDescription('');
      setWorks([{ ...DEFAULT_WORK_ROW, values: { ...DEFAULT_WORK_ROW.values } }]);
      setRows([{ ...DEFAULT_COMMAND_ROW, values: { ...DEFAULT_COMMAND_ROW.values } }]);
    } catch {
      // the store carries the error message
    }
  };

  return (
    <Paper sx={{ p: 3, mt: 3 }} data-testid="scenario-panel">
      <Typography variant="h6" component="h2">
        Scénarios de rénovation
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Décrivez les travaux envisagés : chaque scénario est simulé via Open3CL sur une copie du bâtiment, puis
        comparé à l’état initial.
      </Typography>

      {status === 'error' && (
        <Alert severity="error" sx={{ mt: 2 }} data-testid="scenario-error">
          {error}
        </Alert>
      )}

      <Box sx={{ mt: 2 }} data-testid="scenario-list">
        {scenarios.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Aucun scénario pour ce bâtiment.
          </Typography>
        )}
        {scenarios.map((scenario) => {
          const sim = lastSimulations[scenario.id];
          return (
            <Box
              key={scenario.id}
              data-testid={`scenario-row-${scenario.id}`}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.5 }}
            >
              <Typography variant="body1" sx={{ minWidth: 180 }} data-testid={`scenario-name-${scenario.id}`}>
                {scenario.name}
              </Typography>
              <Chip size="small" variant="outlined" label={`${scenario.commands.length} commande(s)`} />
              <Chip size="small" variant="outlined" label={`version de base ${scenario.baselineVersion}`} />
              {sim !== undefined && (
                <LabelChip label={`${sim.result.energyLabel}/${sim.result.climateLabel}`} testId={`scenario-label-${scenario.id}`} />
              )}
              <Button size="small" startIcon={<PlayArrowIcon />} data-testid={`simulate-scenario-${scenario.id}`} onClick={() => void simulate(scenario.id)}>
                Simuler
              </Button>
              <Button size="small" color="success" startIcon={<CheckCircleIcon />} data-testid={`apply-scenario-${scenario.id}`} onClick={() => void apply(scenario.id)}>
                Appliquer
              </Button>
              <IconButton size="small" aria-label="supprimer" data-testid={`delete-scenario-${scenario.id}`} onClick={() => void remove(scenario.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        })}
      </Box>

      <Divider sx={{ my: 2 }} />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1">Nouveau scénario</Typography>
        <Button
          size="small"
          variant={mode === 'advanced' ? 'outlined' : 'text'}
          data-testid="advanced-mode-toggle"
          onClick={() => setMode(mode === 'work' ? 'advanced' : 'work')}
        >
          {mode === 'advanced' ? 'Mode travaux' : 'Mode avancé'}
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField size="small" label="Nom" value={name} onChange={(e) => setName(e.target.value)} data-testid="new-scenario-name" />
        <TextField size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="new-scenario-description" sx={{ minWidth: 260 }} />
      </Stack>
      {mode === 'work' ? (
        <>
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Travaux envisagés
          </Typography>
          {works.map((work, index) => {
            const entry = catalogEntryForWork(work.workId);
            const options = elementOptionsForWork(work.workId, building, enumTables);
            return (
              <Stack direction="row" spacing={1} key={index} sx={{ mt: 1, alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }} data-testid={`work-row-${index}`}>
                <FormControl size="small" sx={{ minWidth: 240, flexShrink: 0 }} data-testid={`work-type-${index}`}>
                  <InputLabel>Travail</InputLabel>
                  <Select
                    label="Travail"
                    value={work.workId}
                    onChange={(e) => {
                      const next = catalogEntryForWork(String(e.target.value));
                      setWorks(
                        works.map((w, i) =>
                          i === index
                            ? {
                                workId: String(e.target.value),
                                targetId: '',
                                values: next === undefined ? {} : Object.fromEntries(next.fields.map((f) => [f.key, '']))
                              }
                            : w
                        )
                      );
                    }}
                  >
                    {WORK_CATALOG.map((w) => (
                      <MenuItem key={w.id} value={w.id}>
                        <ListItemText primary={w.label} secondary={w.hint} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 300, flexShrink: 0 }} data-testid={`work-target-${index}`}>
                  <InputLabel>Élément</InputLabel>
                  <Select
                    label="Élément"
                    displayEmpty
                    value={work.targetId}
                    sx={{ '& .MuiSelect-select': { whiteSpace: 'normal' } }}
                    onChange={(e) => setWorks(works.map((w, i) => (i === index ? { ...w, targetId: String(e.target.value) } : w)))}
                  >
                    <MenuItem value="" disabled>
                      Élément…
                    </MenuItem>
                    {options.map((o) => (
                      <MenuItem key={o.id} value={o.id} sx={{ whiteSpace: 'normal' }} title={o.secondaryFull}>
                        <ListItemText primary={o.primary} secondary={o.secondary} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {entry?.fields.map((field) =>
                  renderCatalogField(
                    field,
                    entry.targetKind,
                    work.values,
                    (next) => setWorks(works.map((w, i) => (i === index ? { ...w, values: { ...w.values, [field.key]: next } } : w))),
                    `work-field-${index}-${field.key}`
                  )
                )}
                <IconButton size="small" aria-label="retirer le travail" data-testid={`remove-work-${index}`} onClick={() => setWorks(works.filter((_, i) => i !== index))}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })}
        </>
      ) : (
        <>
          {rows.map((row, index) => {
            const entry = catalogEntryFor(row.type);
            const targets = entry === undefined ? [] : (targetOptions[entry.targetKind] ?? []);
            return (
              <Stack direction="row" spacing={1} key={index} sx={{ mt: 1, alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }} data-testid={`command-row-${index}`}>
                <Select
                  size="small"
                  value={row.type}
                  data-testid={`command-type-${index}`}
                  sx={{ maxWidth: 240, '& .MuiSelect-select': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                  onChange={(e) => {
                    const next = catalogEntryFor(e.target.value);
                    setRows(rows.map((r, i) => (i === index ? { type: e.target.value, targetId: '', values: next === undefined ? {} : Object.fromEntries(next.fields.map((f) => [f.key, ''])) } : r)));
                  }}
                >
                  {COMMAND_CATALOG.map((c) => (
                    <MenuItem key={c.type} value={c.type}>
                      {c.label}
                    </MenuItem>
                  ))}
                </Select>
                <Select
                  size="small"
                  displayEmpty
                  value={row.targetId}
                  data-testid={`command-target-${index}`}
                  sx={{ maxWidth: 320, '& .MuiSelect-select': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                  onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, targetId: e.target.value } : r)))}
                >
                  <MenuItem value="" disabled>
                    Élément…
                  </MenuItem>
                  {targets.map((t) => (
                    <MenuItem key={t.id} value={t.id} sx={{ whiteSpace: 'normal' }}>
                      {t.id} — {t.description?.value ?? ''}
                    </MenuItem>
                  ))}
                </Select>
                {entry?.fields.map((field) =>
                  renderCatalogField(
                    field,
                    entry.targetKind,
                    row.values,
                    (next) => setRows(rows.map((r, i) => (i === index ? { ...r, values: { ...r.values, [field.key]: next } } : r))),
                    `command-field-${index}-${field.key}`
                  )
                )}
                <IconButton size="small" aria-label="retirer la commande" data-testid={`remove-command-${index}`} onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })}
        </>
      )}
      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
        {mode === 'work' ? (
          <Button size="small" startIcon={<AddIcon />} data-testid="add-work-button" onClick={() => setWorks([...works, { ...DEFAULT_WORK_ROW, values: { ...DEFAULT_WORK_ROW.values } }])}>
            Ajouter un travail
          </Button>
        ) : (
          <Button size="small" startIcon={<AddIcon />} data-testid="add-command-button" onClick={() => setRows([...rows, { ...DEFAULT_COMMAND_ROW, values: { ...DEFAULT_COMMAND_ROW.values } }])}>
            Ajouter une commande
          </Button>
        )}
        <Button variant="contained" data-testid="create-scenario-button" onClick={() => void onCreate()} disabled={status === 'busy'}>
          Créer le scénario
        </Button>
      </Box>
      {formError !== null && (
        <Alert severity="warning" sx={{ mt: 1 }} data-testid="scenario-form-error">
          {formError}
        </Alert>
      )}

      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button variant="outlined" startIcon={<CompareArrowsIcon />} data-testid="compare-button" onClick={() => void compare()} disabled={status === 'busy' || scenarios.length === 0}>
          Comparer les scénarios
        </Button>
        {lastApply !== null && (
          <Chip color="success" data-testid="apply-success" label={`Appliqué : version ${lastApply.previousVersion} → ${lastApply.newVersion}`} />
        )}
      </Box>

      {comparison !== null && (
        <Box sx={{ mt: 2, overflowX: 'auto' }} data-testid="comparison-table">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Rang</TableCell>
                <TableCell>Scénario</TableCell>
                <TableCell>Énergie</TableCell>
                <TableCell>Climat</TableCell>
                <TableCell align="right">kWh (5 usages)</TableCell>
                <TableCell align="right">kg CO₂e</TableCell>
                <TableCell align="right">Δ kWh</TableCell>
                <TableCell align="right">Δ kg CO₂e</TableCell>
                <TableCell>Changement d’étiquette</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow data-testid="comparison-row-baseline">
                <TableCell>—</TableCell>
                <TableCell>
                  <strong>État initial</strong>
                </TableCell>
                <TableCell>
                  <LabelChip label={comparison.baseline.energyLabel} testId="baseline-energy-label" />
                </TableCell>
                <TableCell>
                  <LabelChip label={comparison.baseline.climateLabel} testId="baseline-climate-label" />
                </TableCell>
                <TableCell align="right" data-testid="baseline-kwh">
                  {comparison.baseline.consumptionKwh.toLocaleString('fr-FR')}
                </TableCell>
                <TableCell align="right">{comparison.baseline.emissionsKg.toLocaleString('fr-FR')}</TableCell>
                <TableCell align="right">—</TableCell>
                <TableCell align="right">—</TableCell>
                <TableCell>—</TableCell>
              </TableRow>
              {comparison.entries.map((entry: ComparisonEntryJson) => (
                <TableRow key={entry.scenarioId} data-testid={`comparison-row-${entry.scenarioId}`}>
                  <TableCell data-testid={`rank-${entry.scenarioId}`}>{entry.rank}</TableCell>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell>
                    <LabelChip label={entry.result.energyLabel} testId={`entry-energy-label-${entry.scenarioId}`} />
                  </TableCell>
                  <TableCell>
                    <LabelChip label={entry.result.climateLabel} testId={`entry-climate-label-${entry.scenarioId}`} />
                  </TableCell>
                  <TableCell align="right">{entry.result.consumptionKwh.toLocaleString('fr-FR')}</TableCell>
                  <TableCell align="right">{entry.result.emissionsKg.toLocaleString('fr-FR')}</TableCell>
                  <TableCell align="right" data-testid={`delta-kwh-${entry.scenarioId}`}>
                    {formatDelta(entry.deltaKwh, 'kWh')}
                  </TableCell>
                  <TableCell align="right" data-testid={`delta-kg-${entry.scenarioId}`}>
                    {formatDelta(entry.deltaKgCo2, 'kg CO₂e')}
                  </TableCell>
                  <TableCell data-testid={`label-change-${entry.scenarioId}`}>
                    {entry.energyLabelChange === null
                      ? '—'
                      : `${entry.energyLabelChange.from} → ${entry.energyLabelChange.to}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}
