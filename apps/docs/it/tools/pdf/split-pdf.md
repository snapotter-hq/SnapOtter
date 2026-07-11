---
description: "Estrai pagine o dividi un PDF in parti."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: a7d956635e57
---

# Dividi PDF {#split-pdf}

Estrai un intervallo di pagine in un nuovo PDF, oppure dividi un documento in blocchi di N pagine.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | Modalità di divisione: `range` o `every` |
| range | string | Quando mode è `range` | - | Intervallo di pagine nella sintassi qpdf, es. `"1-5,8,10-z"` |
| everyN | integer | Quando mode è `every` | - | Dividi in blocchi di N pagine (1-500) |

## Example Request {#example-request}

Estrai pagine specifiche:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Dividi in blocchi di 10 pagine:

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

- In modalità `range`, viene restituito un singolo PDF contenente le pagine selezionate.
- In modalità `every`, il risultato è un archivio ZIP contenente le singole parti.
- Gli intervalli di pagine usano la sintassi qpdf: `1-5` per le pagine da 1 a 5, `z` per l'ultima pagina, e le virgole per combinare gli intervalli (es. `1-3,7,10-z`).
