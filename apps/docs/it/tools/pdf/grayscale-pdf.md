---
description: "Converti tutti i colori di un PDF in scala di grigi."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 8078ee2592d7
---

# PDF in scala di grigi {#grayscale-pdf}

Converti tutti i colori di un PDF in scala di grigi, producendo una versione in bianco e nero del documento.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Accetta dati di form multipart con un file PDF. Non è richiesto alcun campo `settings`.

## Parameters {#parameters}

Questo strumento non ha parametri di configurazione. Carica direttamente il file PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Tutti gli spazi colore (RGB, CMYK) vengono convertiti in scala di grigi, incluse le immagini incorporate, la grafica vettoriale e il testo.
- Il file di output è spesso più piccolo dell'originale perché i dati in scala di grigi richiedono meno byte per pixel.
