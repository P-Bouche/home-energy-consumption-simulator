import { useEffect } from 'react';
import { Alert, Box, Button, FormControlLabel, LinearProgress, Switch, Typography } from '@mui/material';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BuildingModel } from '../components/BuildingModel.tsx';
import { ElementPanel } from '../components/ElementPanel.tsx';
import { ViewerOverlays } from '../components/ViewerOverlays.tsx';
import { useViewerStore } from '../store/viewer-store.ts';

/**
 * 3D viewer page (P3, FR-P3-01): loads the reconstructed geometry of the
 * building through the store (GET /buildings/:id/geometry) and renders it with
 * React Three Fiber. No business logic here.
 */
export function ViewerPage({ buildingId }: Readonly<{ buildingId: string }>) {
  const status = useViewerStore((s) => s.status);
  const error = useViewerStore((s) => s.error);
  const geometry = useViewerStore((s) => s.geometry);
  const loadGeometry = useViewerStore((s) => s.loadGeometry);
  const simulation = useViewerStore((s) => s.simulation);
  const showHeatLoss = useViewerStore((s) => s.showHeatLoss);
  const toggleHeatLoss = useViewerStore((s) => s.toggleHeatLoss);

  useEffect(() => {
    void loadGeometry(buildingId);
  }, [buildingId, loadGeometry]);

  const max = geometry?.bounds.max;
  const cameraPosition: [number, number, number] = max
    ? [max.x * 1.6, -max.y * 1.6, max.z * 1.8]
    : [12, -12, 10];
  const target: [number, number, number] = max ? [max.x / 2, max.y / 2, max.z / 2] : [0, 0, 0];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1 }}>
        <Typography variant="h6" component="h1">
          Modèle 3D — {buildingId}
        </Typography>
        <Button size="small" onClick={() => window.location.assign('#/')}>
          ← Import DPE
        </Button>
        {simulation !== null && (
          <FormControlLabel
            data-testid="heat-loss-toggle"
            control={<Switch checked={showHeatLoss} onChange={() => toggleHeatLoss()} />}
            label="Pertes de chaleur"
          />
        )}
        <Box data-testid="confidence-legend" sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 'auto' }}>
          <span style={{ width: 12, height: 12, background: '#f69e21', display: 'inline-block' }} />
          <Typography variant="caption">élément inféré (hachuré)</Typography>
          <span style={{ width: 12, height: 12, background: '#c62828', display: 'inline-block' }} />
          <Typography variant="caption">forte perte</Typography>
          <span style={{ width: 12, height: 12, background: '#2e7d32', display: 'inline-block' }} />
          <Typography variant="caption">faible perte</Typography>
        </Box>
      </Box>
      {status === 'loading' && <LinearProgress />}
      {status === 'error' && (
        <Alert severity="error" data-testid="viewer-error" sx={{ mx: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }} data-testid="viewer-3d">
          {geometry !== null && (
            <>
              <Canvas camera={{ position: cameraPosition, fov: 50, near: 0.1, far: 500 }}>
                <ambientLight intensity={0.75} />
                <directionalLight position={[max ? max.x : 10, (max?.y ?? 10) + 10, (max?.z ?? 2.5) + 8]} intensity={1.1} />
                <OrbitControls makeDefault target={target} />
                <BuildingModel />
              </Canvas>
              <ViewerOverlays />
              <div data-testid="mesh-hash" data-hash={geometry.meshHash} style={{ display: 'none' }} />
            </>
          )}
        </Box>
        <ElementPanel />
      </Box>
    </Box>
  );
}
