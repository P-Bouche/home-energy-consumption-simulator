import { useEffect, useMemo, useRef } from 'react';
import { Alert, AppBar, Box, Button, FormControlLabel, LinearProgress, Switch, Toolbar, Typography } from '@mui/material';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, Object3D, PCFShadowMap, type DirectionalLight, type PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { cameraFrameForBounds, domainToThree, type DomainPoint } from '@hes/geometry/three';
import { BuildingModel } from '../components/BuildingModel.tsx';
import { ElementPanel } from '../components/ElementPanel.tsx';
import { ViewerOverlays } from '../components/ViewerOverlays.tsx';
import { useHeatLossOverlay, useViewerStore } from '../store/viewer-store.ts';

/**
 * Exposes the live R3F camera and scene on window.__hesCamera / __hesScene so
 * e2e tests can project / raycast with the exact viewer camera and inspect the
 * scene graph (e.g. the selection outline). Test hook only.
 */
function CameraBridge() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__hesCamera = camera as ThreePerspectiveCamera;
    w.__hesScene = scene;
  }, [camera, scene]);
  return null;
}

interface SceneLayout {
  readonly center: [number, number, number];
  readonly size: number;
  readonly height: number;
}

/**
 * One warm shadow-casting directional "sun" (UI audit F9), aimed at the
 * building center through an explicit target object added to the scene.
 */
function SunLight({ center, size, height }: Readonly<{ center: [number, number, number]; size: number; height: number }>) {
  const lightRef = useRef<DirectionalLight>(null);
  const target = useMemo(() => new Object3D(), []);
  useEffect(() => {
    target.position.set(center[0], 0, center[2]);
    if (lightRef.current !== null) lightRef.current.target = target;
  }, [center, target]);
  const position: [number, number, number] = [center[0] + size * 0.9, Math.max(height, 1) + size * 0.75, center[2] - size * 0.55];
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={lightRef}
        castShadow
        position={position}
        intensity={2.6}
        color="#ffe9c4"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-far={size * 4}
        shadow-bias={-0.0004}
      />
    </>
  );
}

/**
 * Ground plane ~3x the footprint (per side), lying on the three.js ground
 * plane y = 0 (domain z = 0 after the axis conversion). Receives the sun
 * shadows.
 */
function GroundPlane({ bounds }: Readonly<{ bounds: { min: DomainPoint; max: DomainPoint } }>) {
  const width = Math.max((bounds.max.x - bounds.min.x) * 3, 1);
  const depth = Math.max((bounds.max.y - bounds.min.y) * 3, 1);
  const center = domainToThree({ x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: 0 });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[center[0], 0, center[2]]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color="#7d8f5e" roughness={1} metalness={0} />
    </mesh>
  );
}

/**
 * 3D viewer page (P3, FR-P3-01): loads the reconstructed geometry of the
 * building through the store (GET /buildings/:id/geometry) and renders it with
 * React Three Fiber. No business logic here.
 *
 * Rendering setup (UI audit F8/F9): the domain geometry is Z-up, three.js is
 * Y-up — `toThreeBufferGeometry` converts the axes once at the rendering
 * boundary, and the default camera is a 3/4 view (azimuth 45°, elevation 30°,
 * distance ≈ 1.8x the bounding sphere) computed from the bounding sphere by
 * `cameraFrameForBounds`. OrbitControls keep Y-up defaults with
 * `maxPolarAngle` just below the horizon so the camera cannot go under the
 * ground plane.
 */
export function ViewerPage({ buildingId }: Readonly<{ buildingId: string }>) {
  const status = useViewerStore((s) => s.status);
  const error = useViewerStore((s) => s.error);
  const geometry = useViewerStore((s) => s.geometry);
  const loadGeometry = useViewerStore((s) => s.loadGeometry);
  const simulation = useViewerStore((s) => s.simulation);
  const showHeatLoss = useViewerStore((s) => s.showHeatLoss);
  const toggleHeatLoss = useViewerStore((s) => s.toggleHeatLoss);
  const dpeNumber = useViewerStore((s) => s.dpeNumber);
  const showRoomLabels = useViewerStore((s) => s.showRoomLabels);
  const toggleRoomLabels = useViewerStore((s) => s.toggleRoomLabels);
  const hoveredElementId = useViewerStore((s) => s.hoveredElementId);
  const { error: overlayError } = useHeatLossOverlay();

  useEffect(() => {
    void loadGeometry(buildingId);
  }, [buildingId, loadGeometry]);

  const frame = useMemo(() => (geometry === null ? null : cameraFrameForBounds(geometry.bounds)), [geometry]);
  const layout = useMemo<SceneLayout | null>(() => {
    if (geometry === null) return null;
    const b = geometry.bounds;
    return {
      center: domainToThree({ x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 }),
      size: Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1),
      height: Math.max(b.max.z - b.min.z, 1)
    };
  }, [geometry]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense" sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => window.location.assign('#/')}>
            ← Import DPE
          </Button>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h1" noWrap>
              Modèle 3D{dpeNumber !== null ? ` — ${dpeNumber}` : ''}
            </Typography>
            <Typography variant="caption" noWrap sx={{ display: 'block', fontFamily: 'monospace' }}>
              {buildingId}
            </Typography>
          </Box>
          <FormControlLabel
            data-testid="room-labels-toggle"
            control={<Switch size="small" checked={showRoomLabels} onChange={() => toggleRoomLabels()} />}
            label="Étiquettes des pièces"
          />
          {simulation !== null && (
            <FormControlLabel
              data-testid="heat-loss-toggle"
              control={<Switch size="small" checked={showHeatLoss} onChange={() => toggleHeatLoss()} />}
              label="Pertes de chaleur"
            />
          )}
          <Box data-testid="confidence-legend" sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
            <span
              title="élément inféré"
              style={{
                width: 14,
                height: 12,
                display: 'inline-block',
                borderRadius: 2,
                border: '1px solid rgba(140, 84, 20, 0.5)',
                background: 'repeating-linear-gradient(45deg, rgba(140, 84, 20, 0.45) 0 1px, transparent 1px 4px)'
              }}
            />
            <Typography variant="caption">inféré</Typography>
            <Box
              sx={{
                width: 110,
                height: 10,
                borderRadius: 1,
                border: '1px solid rgba(0, 0, 0, 0.25)',
                background: 'linear-gradient(90deg, #2e7d32 0%, #f9a825 50%, #c62828 100%)'
              }}
            />
            <Typography variant="caption">0&nbsp;%</Typography>
            <Typography variant="caption">part max</Typography>
          </Box>
        </Toolbar>
      </AppBar>
      {status === 'loading' && <LinearProgress />}
      {status === 'error' && (
        <Alert severity="error" data-testid="viewer-error" sx={{ mx: 2 }}>
          {error}
        </Alert>
      )}
      {overlayError !== null && (
        <Alert severity="warning" data-testid="overlay-error" sx={{ mx: 2 }}>
          Pertes de chaleur indisponibles : {overlayError}
        </Alert>
      )}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            cursor: hoveredElementId !== null ? 'pointer' : 'default'
          }}
          data-testid="viewer-3d"
        >
          {geometry !== null && frame !== null && layout !== null && (
            <>
              <Canvas
                // three r186+ removed PCFSoftShadowMap: PCFShadowMap is the soft PCF kernel now
                shadows={{ enabled: true, type: PCFShadowMap }}
                dpr={[1, 2]}
                gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping }}
                camera={{ position: frame.position, fov: 50, near: 0.1, far: 2000 }}
                style={{ background: 'linear-gradient(180deg, #a9c8e8 0%, #d8e9f7 55%, #e9efe1 100%)' }}
              >
                <hemisphereLight args={['#cfe4ff', '#8f9a76', 0.85]} />
                <SunLight center={layout.center} size={layout.size} height={layout.height} />
                <OrbitControls
                  makeDefault
                  target={frame.target}
                  enableDamping
                  maxPolarAngle={Math.PI / 2 - 0.02}
                  minDistance={frame.radius * 0.5}
                  maxDistance={frame.distance * 4}
                />
                <CameraBridge />
                <GroundPlane bounds={geometry.bounds} />
                <ContactShadows
                  position={[layout.center[0], 0.02, layout.center[2]]}
                  scale={layout.size * 2.5}
                  far={Math.max(layout.height * 2 + 2, 10)}
                  opacity={0.5}
                  blur={2.4}
                  resolution={1024}
                  frames={Infinity}
                />
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
