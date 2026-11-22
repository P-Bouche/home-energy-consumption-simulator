import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import CheckIcon from '@mui/icons-material/Check';
import { confidenceInWords } from '../services/confidence-words.ts';
import type { ImportReportJson, InferredField } from '../types.ts';

const MONOSPACE = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function confidenceColor(confidence: number): 'success' | 'warning' | 'error' {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.5) return 'warning';
  return 'error';
}

/**
 * Raw XML path rendered as secondary monospace detail — never as primary
 * text (UX audit US 11).
 */
function XmlPath({ path }: { readonly path: string }) {
  return (
    <Typography component="code" variant="caption" sx={{ fontFamily: MONOSPACE, color: 'text.secondary' }}>
      {path}
    </Typography>
  );
}

/**
 * One inferred field as a trust-critical card: value, plain-language
 * provenance, confidence score and import date (UX audit F4/F6, US 6).
 */
function InferredCard({ field }: { readonly field: InferredField }) {
  return (
    <Card variant="outlined" data-testid="inferred-card">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <XmlPath path={field.path} />
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 0.5 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
            {JSON.stringify(field.value)}
          </Typography>
          <Chip
            size="small"
            color={confidenceColor(field.confidence)}
            label={`confiance ${field.confidence}`}
            data-testid="inferred-confidence"
          />
        </Stack>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {confidenceInWords({ source: field.source, confidence: field.confidence })}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          importé le {new Date(field.importDate).toLocaleString('fr-FR')}
        </Typography>
      </CardContent>
    </Card>
  );
}

/**
 * Read-only view of an import report v1 (UX US 6): every section is a
 * collapsed Accordion showing only its count in the header; inferred fields
 * render as trust-critical cards (open by default); the unrecognized XML
 * paths collapse to « N chemins non reconnus » with an expandable list and a
 * copy/download action. Raw XML paths only ever appear as monospace detail.
 * Presentation only — no business logic.
 */
export function ImportReportView({ report }: { readonly report: ImportReportJson }) {
  const [showPaths, setShowPaths] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const unrecognizedText = useMemo(
    () => report.unrecognizedFields.map((field) => `${field.path} (${field.occurrences} occurrence(s))`).join('\n'),
    [report.unrecognizedFields]
  );

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(unrecognizedText);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  const onDownload = (): void => {
    const blob = new Blob([unrecognizedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chemins-non-reconnus-${report.dpeNumber ?? 'dpe'}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Paper sx={{ p: 3, mt: 3 }} data-testid="import-report">
      <Typography variant="h6" component="h2">
        Rapport d&apos;import — DPE {report.dpeNumber ?? 'inconnu'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Variante schéma : {report.schemaVariant} · rapport v{report.reportVersion} · généré le{' '}
        {new Date(report.generatedAt).toLocaleString('fr-FR')}
      </Typography>

      <Accordion data-testid="report-parsed" sx={{ mt: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">Champs lus ({report.parsedFields.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List dense sx={{ maxHeight: 260, overflow: 'auto' }} data-testid="parsed-list">
            {report.parsedFields.map((field) => (
              <ListItem key={field.path}>
                <Box sx={{ width: '100%' }}>
                  <XmlPath path={field.path} />
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                    {field.value}
                  </Typography>
                </Box>
              </ListItem>
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      <Accordion data-testid="report-inferred" defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">Champs inférés ({report.inferredFields.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Valeurs estimées par l&apos;app car absentes du DPE — jamais présentées comme mesurées.
          </Typography>
          {report.inferredFields.length === 0 ? (
            <Alert severity="info">Aucune valeur inférée.</Alert>
          ) : (
            <Stack spacing={1}>
              {report.inferredFields.map((field) => (
                <InferredCard key={field.path} field={field} />
              ))}
            </Stack>
          )}
        </AccordionDetails>
      </Accordion>

      <Accordion data-testid="report-unrecognized">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">{report.unrecognizedFields.length} chemins non reconnus</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary">
            Chemins XML du fichier non utilisés par l&apos;import — repliés par défaut.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ExpandMoreIcon />}
              data-testid="unrecognized-toggle"
              onClick={() => setShowPaths((v) => !v)}
            >
              {showPaths ? 'Masquer la liste des chemins' : 'Voir la liste des chemins'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
              data-testid="copy-unrecognized"
              onClick={() => void onCopy()}
            >
              {copied ? 'Copié !' : 'Copier la liste'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              data-testid="download-unrecognized"
              onClick={onDownload}
            >
              Télécharger le détail
            </Button>
            {copyFailed && (
              <Typography variant="caption" color="error" data-testid="copy-unrecognized-error">
                Copie impossible dans ce navigateur — utilisez « Télécharger le détail ».
              </Typography>
            )}
          </Box>
          <Collapse in={showPaths}>
            <List dense sx={{ maxHeight: 260, overflow: 'auto', mt: 1 }} data-testid="unrecognized-list">
              {report.unrecognizedFields.map((field) => (
                <ListItem key={field.path}>
                  <ListItemText
                    primary={`${field.occurrences} occurrence(s)`}
                    secondary={<XmlPath path={field.path} />}
                  />
                </ListItem>
              ))}
            </List>
          </Collapse>
        </AccordionDetails>
      </Accordion>

      <Accordion data-testid="report-missing">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">Champs absents ({report.missingFields.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List dense data-testid="missing-list">
            {report.missingFields.map((field) => (
              <ListItem key={field.path}>
                <ListItemText primary={field.reason} secondary={<XmlPath path={field.path} />} />
              </ListItem>
            ))}
          </List>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
}
