import type { ReactNode } from 'react';
import { Box, Chip, Divider, Paper, Typography, useTheme } from '@mui/material';
import { useViewerStore } from '../store/viewer-store.ts';
import type { ConfidenceJson } from '../types.ts';

/**
 * Side panel showing the properties of the selected element (FR-P3-03):
 * id, kind, label, measured/estimated chip, U-value, area, orientation,
 * confidence (value + source). Pure presentation of store data, laid out as a
 * definition list with the theme border radius (UI audit F12).
 */

function ConfidenceCaption({ value }: Readonly<{ value: ConfidenceJson<unknown> }>) {
  return (
    <Typography component="span" variant="caption" color="text.secondary">
      ({value.source}, confiance {value.confidence})
    </Typography>
  );
}

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

export function ElementPanel() {
  const theme = useTheme();
  const geometry = useViewerStore((s) => s.geometry);
  const selectedElementId = useViewerStore((s) => s.selectedElementId);
  const element = geometry?.elements.find((el) => el.id === selectedElementId) ?? null;

  return (
    <Paper
      data-testid="element-panel"
      elevation={3}
      sx={{ width: 320, p: 2, overflowY: 'auto', borderRadius: theme.shape.borderRadius }}
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
            {element.inferred ? (
              <Chip size="small" color="warning" label="estimé" data-testid="element-inferred" />
            ) : (
              <Chip size="small" color="success" label="mesuré" />
            )}
          </Box>
          <Divider sx={{ my: 1 }} />
          <Row term="surface" testId="element-area">
            {element.areaM2 === null ? (
              '—'
            ) : (
              <>
                {element.areaM2.value} m² <ConfidenceCaption value={element.areaM2} />
              </>
            )}
          </Row>
          <Row term="U" testId="element-uvalue">
            {element.uValueWm2K === null ? (
              '—'
            ) : (
              <>
                {element.uValueWm2K.value} W/m².K <ConfidenceCaption value={element.uValueWm2K} />
              </>
            )}
          </Row>
          <Row term="orientation" testId="element-orientation">
            {element.orientation === null ? (
              '—'
            ) : (
              <>
                {element.orientation.value} <ConfidenceCaption value={element.orientation} />
              </>
            )}
          </Row>
          <Row term="placement" testId="element-confidence">
            confiance {element.placement.confidence} — source {element.placement.source}
          </Row>
        </Box>
      )}
    </Paper>
  );
}
