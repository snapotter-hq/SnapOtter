---
description: "Aggiungi i numeri di pagina a ogni pagina di un PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 8ec33a3992b8
---

# Numeri di pagina PDF {#pdf-page-numbers}

Aggiungi i numeri di pagina "Pagina N di M" a ogni pagina di un PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | Posizionamento del numero di pagina: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | No | `10` | Dimensione del carattere in punti (6-24) |

### Position Values {#position-values}

- `tl` in alto a sinistra, `tc` in alto al centro, `tr` in alto a destra
- `bl` in basso a sinistra, `bc` in basso al centro, `br` in basso a destra

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- I numeri di pagina vengono resi nel formato "Pagina 1 di 10".
- I numeri vengono aggiunti a ogni pagina, incluse eventuali pagine di titolo o di copertina.
- La posizione predefinita `"bc"` colloca i numeri in basso al centro di ogni pagina.
