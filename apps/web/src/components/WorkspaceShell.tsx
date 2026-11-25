import { useState } from 'react';
import { Alert, Box, Button, Chip, LinearProgress, Paper, Tab, Tabs, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { useSimulationStore } from '../store/simulation-store.ts';
import type { ImportReportJson } from '../types.ts';
import { ImportReportView } from './ImportReportView.tsx';
import { SimulationPanel } from './SimulationPanel.tsx';
import { BuildingEditorPanel } from './BuildingEditorPanel.tsx';
import { ScenarioPanel } from './ScenarioPanel.tsx';
import { SynthesePanel } from './SynthesePanel.tsx';

export type WorkspaceTab = 'synthese' | 'report' | 'editor' | 'scenarios';

const TABS: readonly { id: WorkspaceTab; label: string; testId: string }[] = [
  { id: 'synthese', label: 'Synthèse', testId: 'tab-synthese' },
  { id: 'report', label: "Rapport d'import", testId: 'tab-report' },
  // discoverability (#62): the editor corrects the real building — the label says so
  { id: 'editor', label: 'Corriger le bâtiment', testId: 'tab-editor' },
  { id: 'scenarios', label: 'Scénarios de rénovation', testId: 'tab-scenarios' }
];

/**
 * Post-import workspace (UX audit F2/F3, US 2 + 3): one header with the single
 * primary action « Lancer la simulation » and the persistent « Voir le modèle
 * 3D » link, then one tab per dominant region — Synthèse (landing), Rapport
 * d'import, Éditeur du bâtiment, Scénarios de rénovation. All tab panels stay
 * mounted so their stores keep loading; inactive panels are just hidden.
 * Presentation only: the stores own every flow, panels keep their props.
 */
export function WorkspaceShell({
  buildingId,
  report
}: Readonly<{ buildingId: string; report: ImportReportJson }>) {
  const [tab, setTab] = useState<WorkspaceTab>('synthese');
  const status = useSimulationStore((s) => s.status);
  const job = useSimulationStore((s) => s.job);
  const cached = useSimulationStore((s) => s.cached);
  const error = useSimulationStore((s) => s.error);
  const run = useSimulationStore((s) => s.run);

  return (
    <Box sx={{ mt: 3 }} data-testid="workspace">
      <Paper
        variant="outlined"
        sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
        data-testid="workspace-header"
      >
        <Typography variant="h6" component="h2">
          Espace de travail
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<BoltIcon />}
            onClick={() => void run(buildingId)}
            disabled={status === 'running' || status === 'queued'}
            data-testid="run-simulation"
          >
            Lancer la simulation
          </Button>
          {cached && (
            <Chip color="success" label="résultat servi depuis le cache (moteur non rappelé)" data-testid="cached-badge" />
          )}
          <Button
            variant="outlined"
            startIcon={<ViewInArIcon />}
            data-testid="view-3d"
            onClick={() => {
              window.location.hash = `#/building/${buildingId}`;
            }}
          >
            Voir le modèle 3D
          </Button>
        </Box>
      </Paper>

      {(status === 'running' || status === 'queued') && (
        <Box sx={{ mt: 1 }}>
          <LinearProgress />
          <Typography variant="body2" sx={{ mt: 1 }} data-testid="job-status">
            {status === 'queued' ? `job ${job?.status ?? 'queued'}…` : 'simulation en cours…'}
          </Typography>
        </Box>
      )}
      {status === 'error' && (
        <Alert severity="error" sx={{ mt: 1 }} data-testid="simulation-error">
          {error}
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_event, value) => setTab(value as WorkspaceTab)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mt: 2 }}
        data-testid="workspace-tabs"
      >
        {TABS.map((t) => (
          <Tab
            key={t.id}
            value={t.id}
            label={t.label}
            data-testid={t.testId}
            id={`workspace-tab-${t.id}`}
            aria-controls={`workspace-panel-${t.id}`}
          />
        ))}
      </Tabs>

      <Box
        role="tabpanel"
        hidden={tab !== 'synthese'}
        id="workspace-panel-synthese"
        aria-labelledby="workspace-tab-synthese"
        data-testid="panel-synthese"
      >
        <SynthesePanel report={report} onGoToScenarios={() => setTab('scenarios')} />
        <SimulationPanel buildingId={buildingId} />
      </Box>
      <Box
        role="tabpanel"
        hidden={tab !== 'report'}
        id="workspace-panel-report"
        aria-labelledby="workspace-tab-report"
        data-testid="panel-report"
      >
        <ImportReportView report={report} />
      </Box>
      <Box
        role="tabpanel"
        hidden={tab !== 'editor'}
        id="workspace-panel-editor"
        aria-labelledby="workspace-tab-editor"
        data-testid="panel-editor"
      >
        <BuildingEditorPanel buildingId={buildingId} onGoToScenarios={() => setTab('scenarios')} />
      </Box>
      <Box
        role="tabpanel"
        hidden={tab !== 'scenarios'}
        id="workspace-panel-scenarios"
        aria-labelledby="workspace-tab-scenarios"
        data-testid="panel-scenarios"
      >
        <ScenarioPanel buildingId={buildingId} />
      </Box>
    </Box>
  );
}
