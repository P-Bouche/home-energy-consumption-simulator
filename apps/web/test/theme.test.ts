import { describe, expect, it } from 'vitest';
import { theme } from '../src/theme.ts';

describe('theme (UI audit F1/F2, issue #27)', () => {
  it('uses a restrained palette — never the default MUI blue/purple', () => {
    expect(theme.palette.primary.main).toBe('#1f5d55');
    expect(theme.palette.primary.main).not.toBe('#1976d2');
    expect(theme.palette.secondary.main).not.toBe('#9c27b0');
    expect(theme.palette.mode).toBe('light');
  });

  it('sets borderRadius 10', () => {
    expect(theme.shape.borderRadius).toBe(10);
  });

  it('never uppercases button labels (French copy stays as written)', () => {
    expect(theme.typography.button?.textTransform).toBe('none');
  });

  it('declares a realistic system font stack (no unloaded webfont)', () => {
    expect(theme.typography.fontFamily).toContain('Segoe UI');
    expect(theme.typography.fontFamily).toContain('sans-serif');
    expect(theme.typography.fontFamily).not.toBe('Roboto, Helvetica, Arial, sans-serif');
  });

  it('keeps one consistent Paper elevation for every surface', () => {
    expect(theme.components?.MuiPaper?.defaultProps?.elevation).toBe(1);
  });
});
