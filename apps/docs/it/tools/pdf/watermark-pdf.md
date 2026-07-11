---
description: "Aggiungi una filigrana di testo a ogni pagina di un PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 4be05e1bbd47
---

# Filigrana PDF {#watermark-pdf}

Applica una filigrana di testo su ogni pagina di un PDF con posizione, dimensione, opacità e rotazione configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Testo della filigrana (1-200 caratteri) |
| position | string | No | `"c"` | Posizionamento sulla pagina: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | Dimensione del carattere in punti (6-72) |
| opacity | number | No | `0.3` | Opacità della filigrana (0.05-1) |
| rotation | number | No | `45` | Angolo di rotazione in gradi (da -180 a 180) |

### Position Values {#position-values}

- `tl` in alto a sinistra, `tc` in alto al centro, `tr` in alto a destra
- `l` al centro a sinistra, `c` al centro, `r` al centro a destra
- `bl` in basso a sinistra, `bc` in basso al centro, `br` in basso a destra

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- La filigrana viene resa come una sovrapposizione di testo su ogni pagina.
- Lo stesso testo, posizione e stile della filigrana vengono applicati in modo uniforme a tutte le pagine.
- Usa valori di opacità più bassi (0.1-0.3) per filigrane discrete che non oscurano il contenuto.
