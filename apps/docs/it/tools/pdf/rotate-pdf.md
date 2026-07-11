---
description: "Ruota le pagine di un PDF di 90, 180 o 270 gradi."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: f1fb2c7e5ac2
---

# Ruota PDF {#rotate-pdf}

Ruota tutte le pagine o pagine selezionate di un PDF di un angolo specificato.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | Angolo di rotazione: `90`, `180`, o `270` |
| range | string | No | `"1-z"` | Intervallo di pagine nella sintassi qpdf, es. `"1-5,8"` (`"1-z"` = tutte le pagine) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- La rotazione è in senso orario.
- Gli intervalli di pagine usano la sintassi qpdf: `1-5` per le pagine da 1 a 5, `z` per l'ultima pagina, e le virgole per combinare gli intervalli.
- L'intervallo predefinito `"1-z"` ruota tutte le pagine.
