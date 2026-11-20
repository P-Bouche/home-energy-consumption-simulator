import {
  Alert,
  Box,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography
} from '@mui/material';
import type { ImportReportJson } from '../types.ts';

function confidenceColor(confidence: number): 'success' | 'warning' | 'error' {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.5) return 'warning';
  return 'error';
}

/**
 * Read-only view of an import report v1: parsed fields, inferred fields with
 * their confidence metadata, unrecognized fields and missing fields.
 * Presentation only — no business logic.
 */
export function ImportReportView({ report }: { readonly report: ImportReportJson }) {
  return (
    <Paper sx={{ p: 3, mt: 3 }} data-testid="import-report">
      <Typography variant="h6" component="h2">
        Rapport d&apos;import — DPE {report.dpeNumber ?? 'inconnu'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Variante schéma : {report.schemaVariant} · rapport v{report.reportVersion} · généré le{' '}
        {new Date(report.generatedAt).toLocaleString('fr-FR')}
      </Typography>

      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle1" data-testid="report-parsed">
          Champs lus ({report.parsedFields.length})
        </Typography>
        <List dense sx={{ maxHeight: 180, overflow: 'auto' }}>
          {report.parsedFields.map((field) => (
            <ListItem key={field.path}>
              <ListItemText primary={field.path} secondary={field.value} />
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="subtitle1" data-testid="report-inferred">
          Champs inférés ({report.inferredFields.length}) — jamais présentés comme mesurés
        </Typography>
        {report.inferredFields.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            Aucune valeur inférée.
          </Alert>
        ) : (
          <List dense sx={{ maxHeight: 220, overflow: 'auto' }}>
            {report.inferredFields.map((field) => (
              <ListItem key={field.path}>
                <ListItemText
                  primary={
                    <>
                      {field.path} = {JSON.stringify(field.value)}{' '}
                      <Chip
                        size="small"
                        color={confidenceColor(field.confidence)}
                        label={`confiance ${field.confidence}`}
                      />
                    </>
                  }
                  secondary={`${field.source} · importé le ${new Date(field.importDate).toLocaleString('fr-FR')}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="subtitle1" data-testid="report-unrecognized">
          Éléments non reconnus ({report.unrecognizedFields.length} chemins)
        </Typography>
        <List dense sx={{ maxHeight: 180, overflow: 'auto' }}>
          {report.unrecognizedFields.map((field) => (
            <ListItem key={field.path}>
              <ListItemText primary={field.path} secondary={`${field.occurrences} occurrence(s)`} />
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="subtitle1" data-testid="report-missing">
          Champs absents ({report.missingFields.length})
        </Typography>
        <List dense>
          {report.missingFields.map((field) => (
            <ListItem key={field.path}>
              <ListItemText primary={field.path} secondary={field.reason} />
            </ListItem>
          ))}
        </List>
      </Box>
    </Paper>
  );
}
