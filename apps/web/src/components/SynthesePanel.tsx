import { Alert, Box, Chip, Divider, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import { useSimulationStore } from '../store/simulation-store.ts';
import { confidenceInWords } from '../services/confidence-words.ts';
import type { ImportReportJson, SimulationResultJson } from '../types.ts';

const LABEL_COLORS: Record<string, string> = {
  A: '#1a9850',
  B: '#66bd63',
  C: '#a6d96a',
  D: '#fee08b',
  E: '#fdae61',
  F: '#f46d43',
  G: '#d73027'
};

function labelChip(label: string, kind: 'Énergie' | 'Climat'): React.ReactElement {
  return (
    <Chip
      label={`${kind} : ${label}`}
      data-testid={kind === 'Énergie' ? 'energy-label' : 'climate-label'}
      sx={{ backgroundColor: LABEL_COLORS[label] ?? '#999', color: '#111', fontWeight: 700 }}
    />
  );
}

/**
 * Latest simulation result summary (labels + key figures), rendered at the
 * top of the Synthèse tab (UX audit F3 / US 3). Presentation only — the
 * simulation store owns the data.
 */
function SimulationSummary({ result }: { readonly result: SimulationResultJson }) {
  return (
    <Box data-testid="simulation-result" sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {labelChip(result.energyLabel, 'Énergie')}
        {labelChip(result.climateLabel, 'Climat')}
        {result.consumptionKwhM2An !== null && (
          <Chip label={`${result.consumptionKwhM2An} kWh/m².an`} data-testid="consumption-m2" variant="outlined" />
        )}
        {result.emissionsKgCo2M2An !== null && (
          <Chip label={`${result.emissionsKgCo2M2An} kg CO₂/m².an`} data-testid="emissions-m2" variant="outlined" />
        )}
      </Box>
      <Typography variant="body2" sx={{ mt: 1 }} data-testid="simulation-detail">
        {result.consumptionKwh.toLocaleString('fr-FR')} kWh (5 usages) ·{' '}
        {result.emissionsKg.toLocaleString('fr-FR')} kg CO₂e · moteur Open3CL v{result.engineVersion} ·{' '}
        {new Date(result.createdAt).toLocaleString('fr-FR')}
      </Typography>
    </Box>
  );
}

/**
 * Synthèse tab of the workspace (UX audit F2 / US 2): DPE labels + key figures
 * from the latest simulation, and the inferred values of the import expressed
 * in plain words. Presentation only.
 */
export function SynthesePanel({ report }: { readonly report: ImportReportJson }) {
  const result = useSimulationStore((s) => s.result);

  return (
    <Paper sx={{ p: 3 }} data-testid="synthese-panel">
      <Typography variant="h6" component="h2">
        Synthèse — DPE {report.dpeNumber ?? 'inconnu'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {report.parsedFields.length} champs lus · {report.unrecognizedFields.length} chemins non reconnus ·{' '}
        {report.missingFields.length} champs absents
      </Typography>

      {result !== null ? (
        <SimulationSummary result={result} />
      ) : (
        <Alert severity="info" sx={{ mt: 2 }} data-testid="simulation-empty">
          Aucune simulation pour le moment — lancez « Lancer la simulation » depuis l&apos;en-tête de l&apos;espace
          de travail.
        </Alert>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle1" data-testid="synthese-inferred">
        Valeurs estimées ({report.inferredFields.length}) — jamais présentées comme mesurées
      </Typography>
      {report.inferredFields.length === 0 ? (
        <Alert severity="info" sx={{ mt: 1 }}>
          Aucune valeur estimée : toutes les valeurs proviennent du DPE.
        </Alert>
      ) : (
        <List dense sx={{ maxHeight: 260, overflow: 'auto' }} data-testid="synthese-inferred-list">
          {report.inferredFields.map((field) => (
            <ListItem key={field.path} data-testid="synthese-inferred-item">
              <ListItemText
                primary={`${field.path} = ${JSON.stringify(field.value)}`}
                secondary={`${confidenceInWords({ source: field.source, confidence: field.confidence })} · confiance ${field.confidence} · importé le ${new Date(field.importDate).toLocaleString('fr-FR')}`}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
