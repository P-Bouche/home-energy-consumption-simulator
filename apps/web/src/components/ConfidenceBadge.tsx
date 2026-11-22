import { useState } from 'react';
import { Box, Button, Chip, Collapse, Typography } from '@mui/material';
import { confidenceInWords } from '../services/confidence-words.ts';
import type { ConfidenceJson } from '../types.ts';

interface ConfidenceBadgeProps {
  /** the confidence-wrapped value to render; null renders a plain « absent » */
  readonly value: ConfidenceJson<unknown> | null;
  /** base data-testid: the wrapper takes it, sub-elements get `<testId>-chip|-score|-toggle|-detail` */
  readonly testId?: string;
}

/**
 * Plain-words confidence badge (UX audit F6 / US 7): « mesuré par le DPE » vs
 * « estimé — à vérifier » vs « saisi par vous » via the shared
 * confidence-words helper, the numeric score as a subtle secondary indicator,
 * and the raw source path behind a « d'où vient cette valeur ? » detail.
 * Container-agnostic: reused by the editor rows, the Synthèse tab and the 3D
 * side panel.
 */
export function ConfidenceBadge({ value, testId }: Readonly<ConfidenceBadgeProps>) {
  const [open, setOpen] = useState(false);
  if (value === null) {
    return (
      <Typography variant="caption" color="text.secondary" data-testid={testId}>
        absent
      </Typography>
    );
  }
  const words = confidenceInWords(value);
  const isUser = value.source === 'user';
  const color: 'success' | 'warning' | 'default' = isUser ? 'success' : value.confidence < 1 ? 'warning' : 'default';
  return (
    <Box
      data-testid={testId}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}
    >
      <Chip
        size="small"
        label={words}
        color={color}
        variant={isUser ? 'filled' : 'outlined'}
        data-testid={testId !== undefined ? `${testId}-chip` : undefined}
      />
      <Typography variant="caption" color="text.secondary" data-testid={testId !== undefined ? `${testId}-score` : undefined}>
        confiance {value.confidence}
      </Typography>
      <Button
        size="small"
        sx={{ minWidth: 0, p: 0, textTransform: 'none', fontSize: '0.7rem' }}
        data-testid={testId !== undefined ? `${testId}-toggle` : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? 'masquer la source' : 'd’où vient cette valeur ?'}
      </Button>
      <Collapse in={open} sx={{ width: '100%' }}>
        <Typography
          variant="caption"
          sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}
          data-testid={testId !== undefined ? `${testId}-detail` : undefined}
        >
          source : {value.source} · importé le {new Date(value.importDate).toLocaleString('fr-FR')}
        </Typography>
      </Collapse>
    </Box>
  );
}
