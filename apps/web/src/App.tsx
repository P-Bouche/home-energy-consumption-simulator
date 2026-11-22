import { useEffect, useState } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { UploadPage } from './pages/UploadPage.tsx';
import { ViewerPage } from './pages/ViewerPage.tsx';
import { theme } from './theme.ts';

function useHashRoute(): string {
  const [hash, setHash] = useState<string>(() => window.location.hash);
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/**
 * App root: hash routing — `/` upload page (P1), `#/building/:id` 3D viewer (P3).
 */
export default function App() {
  const hash = useHashRoute();
  const match = /^#\/building\/([0-9a-fA-F-]{36})/.exec(hash);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {match !== null ? <ViewerPage buildingId={match[1] as string} /> : <UploadPage />}
    </ThemeProvider>
  );
}
