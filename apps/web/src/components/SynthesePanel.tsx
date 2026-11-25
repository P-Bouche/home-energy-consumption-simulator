import { useState } from 'react';
import { Alert, Box, Button, Chip, Divider, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import { useSimulationStore } from '../store/simulation-store.ts';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';
import type { ImportReportJson, SimulationResultJson } from '../types.ts';

/** localStorage key: the "Par où commencer ?" card is dismissed forever on this device (#62) */
const NEXT_STEPS_KEY = 'hes.next-steps-dismissed';

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
export function SynthesePanel({
  report,
  onGoToScenarios
}: Readonly<{ report: ImportReportJson; onGoToScenarios: () => void }>) {
  const result = useSimulationStore((s) => s.result);
  const [showNextSteps, setShowNextSteps] = useState(() => {
    try {
      return localStorage.getItem(NEXT_STEPS_KEY) !== '1';
    } catch {
      return true;
    }
  });

  const dismissNextSteps = (): void => {
    try {
      localStorage.setItem(NEXT_STEPS_KEY, '1');
    } catch {
      // private mode etc.: just hide for this render
    }
    setShowNextSteps(false);
  };

  return (
    <Paper sx={{ p: 3 }} data-testid="synthese-panel">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Synthèse — DPE {report.dpeNumber ?? 'inconnu'}
        </Typography>
        <Button variant="outlined" size="small" onClick={onGoToScenarios} data-testid="cta-test-renovation">
          Tester une rénovation
        </Button>
      </Box>

      {showNextSteps && (
        <Alert
          severity="info"
          sx={{ mt: 2 }}
          data-testid="next-steps-card"
          onClose={dismissNextSteps}
          closeText="Ne plus afficher"
        >
          <Typography variant="subtitle2">Par où commencer ?</Typography>
          <List dense disablePadding>
            <ListItem disableGutters dense>
              <ListItemText primary="1. Voir la synthèse du DPE (cet onglet)" />
            </ListItem>
            <ListItem disableGutters dense>
              <ListItemText primary="2. Tester une rénovation (onglet Scénarios, sans modifier le bâtiment)" />
            </ListItem>
            <ListItem disableGutters dense>
              <ListItemText primary="3. Corriger un élément si une valeur DPE semble fausse (onglet Corriger le bâtiment)" />
            </ListItem>
          </List>
        </Alert>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {report.parsedFields.length} champs lus · {report.unrecognizedFields.length} chemins non reconnus ·{' '}
        {report.missingFields.length} champs absents
      </Typography>
      {/* US 7 / F6: the estimated values are aggregated here, in one place,
          instead of confidence chips repeated on every element row */}
      <Typography variant="body2" sx={{ mt: 0.5 }} data-testid="synthese-confidence-summary">
        {report.parsedFields.length} valeurs mesurées par le DPE · {report.inferredFields.length} valeurs estimées — à
        vérifier
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
          {report.inferredFields.map((field, index) => (
            <ListItem key={field.path} data-testid="synthese-inferred-item">
              <ListItemText
                primary={JSON.stringify(field.value)}
                secondary={
                  <ConfidenceBadge
                    value={{
                      value: field.value,
                      source: field.source,
                      confidence: field.confidence,
                      importDate: field.importDate
                    }}
                    testId={`synthese-inferred-source-${index}`}
                  />
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
