---
description: "Extraheer pagina's of splits een PDF in delen."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: ed6456076bd6
---

# Split PDF {#split-pdf}

Extraheer een reeks pagina's naar een nieuwe PDF, of splits een document in stukken van N pagina's.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Nee | `"range"` | Splitsmodus: `range` of `every` |
| range | string | Wanneer mode `range` is | - | Paginabereik in qpdf-syntaxis, bijv. `"1-5,8,10-z"` |
| everyN | integer | Wanneer mode `every` is | - | Splitsen in stukken van N pagina's (1-500) |

## Example Request {#example-request}

Specifieke pagina's extraheren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Splitsen in stukken van 10 pagina's:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- In de modus `range` wordt een enkele PDF met de geselecteerde pagina's teruggegeven.
- In de modus `every` is het resultaat een ZIP-archief met de afzonderlijke delen.
- Paginabereiken gebruiken qpdf-syntaxis: `1-5` voor pagina's 1 tot en met 5, `z` voor de laatste pagina, en komma's om bereiken te combineren (bijv. `1-3,7,10-z`).
