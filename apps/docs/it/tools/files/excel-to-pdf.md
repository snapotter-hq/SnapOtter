---
description: "Converte i fogli di calcolo in PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 3e8941a1600e
---

# Excel to PDF {#excel-to-pdf}

Converte i fogli di calcolo Excel, OpenDocument o CSV in PDF. I fogli larghi possono essere impaginati su più pagine.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Accetta dati form multipart con un file Excel/ODS/CSV.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un foglio di calcolo e verrà convertito in PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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

- Formati di input accettati: `.xlsx`, `.xls`, `.ods`, `.csv`.
- I fogli larghi possono essere suddivisi su più pagine nel PDF risultante.
- I grafici e la formattazione condizionale vengono renderizzati nell'output PDF.
- La conversione è gestita da LibreOffice in esecuzione headless sul server.
