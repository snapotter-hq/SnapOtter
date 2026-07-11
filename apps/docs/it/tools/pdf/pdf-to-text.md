---
description: "Estrai testo semplice da un PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: a77ebe300002
---

# PDF in testo {#pdf-to-text}

Estrai tutto il testo semplice leggibile da un documento PDF in un file di testo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Accetta dati di form multipart con un file PDF.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un PDF e il suo contenuto testuale verrà estratto.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- Questo è uno strumento veloce (sincrono) che restituisce direttamente il risultato.
- Il campo `chars` nella risposta indica il numero di caratteri estratti.
- Viene estratto solo il testo incorporato digitalmente. Per documenti scansionati o PDF basati su immagini, usa invece lo strumento [OCR PDF](./ocr-pdf).
