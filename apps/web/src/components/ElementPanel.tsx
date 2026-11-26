import type { ReactNode } from 'react';
import { Box, Chip, Divider, Paper, Typography } from '@mui/material';
import { useViewerStore } from '../store/viewer-store.ts';
import { confidenceInWords } from '../services/confidence-words.ts';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';
import type { ConfidenceJson } from '../types.ts';

/**
 * Side panel showing the properties of the selected element (FR-P3-03):
 * id, kind, label, plain-words provenance chip, U-value, area, orientation,
 * placement — each value annotated « mesuré par le DPE » vs « estimé — à
 * vérifier » with the raw source behind « d'où vient cette valeur ? »
 * (UX audit F6 / US 7). Pure presentation of store data, laid out as a
 * definition list with the theme border radius (UI audit F12).
 */

function Row({ term, testId, children }: Readonly<{ term: string; testId?: string; children: ReactNode }>) {
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.25 }}>
      <Box component="dt" sx={{ width: 96, flexShrink: 0, color: 'text.secondary', fontSize: 13 }}>
        {term}
      </Box>
      <Box component="dd" data-testid={testId} sx={{ m: 0, fontSize: 13, overflowWrap: 'anywhere' }}>
        {children}
      </Box>
    </Box>
  );
}

/** Renders a value followed by its plain-words confidence badge. */
function ValueWithConfidence({
  text,
  value,
  testId
}: Readonly<{ text: string; value: ConfidenceJson<unknown>; testId: string }>) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <span>{text}</span>
      <ConfidenceBadge value={value} testId={testId} />
    </Box>
  );
}

export function ElementPanel() {
  const geometry = useViewerStore((s) => s.geometry);
  const selectedElementId = useViewerStore((s) => s.selectedElementId);
  const element = geometry?.elements.find((el) => el.id === selectedElementId) ?? null;

  return (
    <Paper
      data-testid="element-panel"
      elevation={3}
      sx={{
        width: { xs: '100%', md: 320 },
        maxHeight: { xs: '38vh', md: 'none' },
        p: 2,
        overflowY: 'auto'
      }}
    >
      <Typography variant="h6" component="h2">
        Élément sélectionné
      </Typography>
      {element === null ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Cliquez sur un élément du modèle 3D pour voir ses propriétés.
        </Typography>
      ) : (
        <Box component="dl" sx={{ m: 0, mt: 1 }}>
          <Row term="id" testId="element-id">
            {element.id}
          </Row>
          <Row term="type">{element.kind}</Row>
          <Row term="label">{element.label}</Row>
          <Box sx={{ py: 0.5 }}>
            <Chip
              size="small"
              color={element.inferred ? 'warning' : 'success'}
              label={confidenceInWords({ source: element.placement.source, confidence: element.placement.confidence })}
              data-testid={element.inferred ? 'element-inferred' : 'element-measured'}
            />
          </Box>
          <Divider sx={{ my: 1 }} />
          <Row term="surface" testId="element-area">
            {element.areaM2 === null ? (
              '—'
            ) : (
              <ValueWithConfidence text={`${element.areaM2.value} m²`} value={element.areaM2} testId="element-area-source" />
            )}
          </Row>
          <Row term="U" testId="element-uvalue">
            {element.uValueWm2K === null ? (
              '—'
            ) : (
              <ValueWithConfidence
                text={`${element.uValueWm2K.value} W/m².K`}
                value={element.uValueWm2K}
                testId="element-uvalue-source"
              />
            )}
          </Row>
          <Row term="orientation" testId="element-orientation">
            {element.orientation === null ? (
              '—'
            ) : (
              <ValueWithConfidence
                text={String(element.orientation.value)}
                value={element.orientation}
                testId="element-orientation-source"
              />
            )}
          </Row>
          <Row term="placement" testId="element-confidence-row">
            <ConfidenceBadge value={element.placement} testId="element-confidence" />
          </Row>
        </Box>
      )}
    </Paper>
  );
}
