---
description: "Converte tra i formati Word, OpenDocument, RTF e testo semplice."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 3e9b4313b9d8
---

# Convert Document {#convert-document}

Converte i documenti tra i formati Word (DOCX), OpenDocument (ODT), RTF e testo semplice usando LibreOffice.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Accetta dati form multipart con un file Word/ODT/RTF/TXT e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Formato di output: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- Formati di input accettati: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- La conversione è gestita da LibreOffice in esecuzione headless sul server.
- La formattazione complessa (macro, oggetti incorporati) potrebbe non sopravvivere alla conversione tra i formati.
- Il formato di output deve essere diverso dal formato di input.
