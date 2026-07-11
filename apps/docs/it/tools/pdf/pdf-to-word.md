---
description: "Converti un PDF in un documento Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 586b219dd3cd
---

# PDF in Word {#pdf-to-word}

Converti un PDF basato su testo in un documento Word (DOCX). Ideale per PDF con testo selezionabile; le pagine scansionate richiederanno prima l'OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Accetta dati di form multipart con un file PDF.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un PDF e verrà convertito in DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

Restituisce `202 Accepted`. Monitora l'avanzamento tramite SSE su `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- Funziona meglio con PDF basati su testo. Le pagine scansionate o solo immagine produrranno un output vuoto o minimo; usa [OCR PDF](./ocr-pdf) per aggiungere prima un livello di testo.
- La conversione è gestita da LibreOffice in esecuzione headless sul server.
- I layout complessi (multi-colonna, elementi sovrapposti) potrebbero non convertirsi perfettamente.
