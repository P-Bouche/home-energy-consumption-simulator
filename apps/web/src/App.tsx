import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { UploadPage } from './pages/UploadPage.tsx';

const theme = createTheme({ palette: { mode: 'light' } });

/**
 * App root: theme + upload page (P1 scope).
 */
export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <UploadPage />
    </ThemeProvider>
  );
}
