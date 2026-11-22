import { createTheme } from '@mui/material/styles';

/**
 * The single MUI theme of the web app (UI audit F1/F2, issue #27).
 *
 * - Restrained palette: deep petrol primary and a warm terracotta accent —
 *   never the default MUI blue (`#1976d2`) / purple (`#9c27b0`).
 * - `shape.borderRadius: 10` everywhere (cards, buttons, papers, inputs).
 * - Buttons keep their French label as-is (`textTransform: 'none'`) —
 *   all-caps French buttons read as aggressive.
 * - The font is a realistic system stack: every entry is a font actually
 *   installed on common end-user systems (San Francisco on macOS/iOS,
 *   Segoe UI on Windows, Roboto on Android/ChromeOS), so no font file has
 *   to be bundled and the app never falls back to an unstyled default.
 * - One consistent Paper elevation (1) for every elevated surface.
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1f5d55',
      light: '#3d7a71',
      dark: '#143f3a',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#b3541e',
      light: '#d1763f',
      dark: '#8a3f14',
      contrastText: '#ffffff'
    },
    info: {
      main: '#546e7a'
    },
    background: {
      default: '#f4f6f5',
      paper: '#ffffff'
    },
    text: {
      primary: '#1d2b28',
      secondary: '#5c6f6a'
    },
    divider: '#dde5e2'
  },
  shape: {
    borderRadius: 10
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      '"Noto Sans"',
      'sans-serif'
    ].join(','),
    h4: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 }
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 1 }
    },
    MuiAccordion: {
      defaultProps: { disableGutters: true },
      styleOverrides: {
        root: {
          '&::before': { display: 'none' },
          backgroundImage: 'none'
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10 }
      }
    }
  }
});
