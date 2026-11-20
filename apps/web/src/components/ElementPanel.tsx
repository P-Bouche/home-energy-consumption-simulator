import { Box, Chip, Divider, Paper, Typography } from '@mui/material';
import { useViewerStore } from '../store/viewer-store.ts';

/**
 * Side panel showing the properties of the selected element (FR-P3-03):
 * id, kind, U-value, area, orientation, confidence (value + source). Pure
 * presentation of store data.
 */
export function ElementPanel() {
  const geometry = useViewerStore((s) => s.geometry);
  const selectedElementId = useViewerStore((s) => s.selectedElementId);
  const element = geometry?.elements.find((el) => el.id === selectedElementId) ?? null;

  return (
    <Paper
      data-testid="element-panel"
      elevation={3}
      sx={{ width: 320, p: 2, overflowY: 'auto', borderRadius: 0 }}
    >
      <Typography variant="h6" component="h2">
        Élément sélectionné
      </Typography>
      {element === null ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Cliquez sur un élément du modèle 3D pour voir ses propriétés.
        </Typography>
      ) : (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" data-testid="element-id">
            id : {element.id}
          </Typography>
          <Typography variant="body2">type : {element.kind}</Typography>
          <Typography variant="body2">label : {element.label}</Typography>
          <Box sx={{ mt: 1 }}>
            {element.inferred ? (
              <Chip size="small" color="warning" label="inféré" data-testid="element-inferred" />
            ) : (
              <Chip size="small" color="success" label="mesuré" />
            )}
          </Box>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" data-testid="element-area">
            surface : {element.areaM2 === null ? '—' : `${element.areaM2.value} m² (confiance ${element.areaM2.confidence}, ${element.areaM2.source})`}
          </Typography>
          <Typography variant="body2" data-testid="element-uvalue">
            U : {element.uValueWm2K === null ? '—' : `${element.uValueWm2K.value} W/m².K (confiance ${element.uValueWm2K.confidence}, ${element.uValueWm2K.source})`}
          </Typography>
          <Typography variant="body2" data-testid="element-orientation">
            orientation : {element.orientation === null ? '—' : `${element.orientation.value} (confiance ${element.orientation.confidence}, ${element.orientation.source})`}
          </Typography>
          <Typography variant="body2" data-testid="element-confidence">
            placement : confiance {element.placement.confidence} — source {element.placement.source}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
