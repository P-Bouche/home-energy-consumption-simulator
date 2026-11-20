import { useRef, useState } from 'react';
import { Alert, Box, Button, Container, LinearProgress, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useImportStore } from '../store/import-store.ts';
import { ImportReportView } from '../components/ImportReportView.tsx';
import { SimulationPanel } from '../components/SimulationPanel.tsx';

/**
 * Upload page: file picker → POST /api/imports/dpe → import report view.
 * No business logic here: the store owns the flow.
 */
export function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const status = useImportStore((s) => s.status);
  const error = useImportStore((s) => s.error);
  const report = useImportStore((s) => s.report);
  const buildingId = useImportStore((s) => s.buildingId);
  const upload = useImportStore((s) => s.upload);

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setFileName(file.name);
    const content = await file.text();
    await upload(file.name, content);
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1">
        Importer un DPE (XML)
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
        Le fichier DPE est importé dans le modèle Building et persisté ; chaque valeur inférée est
        accompagnée de sa source, son score de confiance et sa date d&apos;import.
      </Typography>

      <Box sx={{ mt: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          style={{ display: 'none' }}
          data-testid="file-input"
          onChange={(event) => void onFileSelected(event)}
        />
        <Button
          variant="contained"
          startIcon={<CloudUploadIcon />}
          onClick={() => inputRef.current?.click()}
          disabled={status === 'uploading'}
        >
          Choisir un fichier DPE…
        </Button>
        {fileName !== null && <Typography variant="body2">{fileName}</Typography>}
      </Box>

      {status === 'uploading' && <LinearProgress sx={{ mt: 2 }} />}
      {status === 'error' && (
        <Alert severity="error" sx={{ mt: 2 }} data-testid="upload-error">
          {error}
        </Alert>
      )}
      {status === 'done' && report !== null && buildingId !== null && (
        <>
          <Alert severity="success" sx={{ mt: 2 }} data-testid="upload-success">
            Bâtiment importé : {buildingId}
          </Alert>
          <ImportReportView report={report} />
          <SimulationPanel buildingId={buildingId} />
        </>
      )}
    </Container>
  );
}
