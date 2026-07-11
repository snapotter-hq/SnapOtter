---
description: "Genera codici QR con colori personalizzati e livelli di correzione degli errori."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: e05c559949e1
---

# QR Code Generator {#qr-code-generator}

Genera immagini di codici QR da testo o URL con dimensione configurabile, livello di correzione degli errori e colori personalizzati di primo piano e sfondo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Accetta un **corpo JSON** (non multipart). Non serve caricare alcun file.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Contenuto da codificare nel codice QR (da 1 a 2000 caratteri) |
| size | number | No | `400` | Larghezza/altezza dell'immagine di output in pixel (da 100 a 10000) |
| errorCorrection | string | No | `"M"` | Livello di correzione degli errori: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | No | `"#000000"` | Colore di primo piano/modulo del codice QR in esadecimale (`#RRGGBB`) |
| background | string | No | `"#FFFFFF"` | Colore di sfondo del codice QR in esadecimale (`#RRGGBB`) |
| logoDataUri | string | No | - | Immagine del logo come data URI (`data:image/png;base64,...` o `data:image/jpeg;base64,...`, max 700 KB). Centrata sul codice QR al 22% della dimensione del QR. Forza la correzione degli errori a `H` |

### Error Correction Levels {#error-correction-levels}

| Level | Recovery | Use Case |
|-------|----------|----------|
| `L` | ~7% | Massima densità di dati |
| `M` | ~15% | Bilanciato (predefinito) |
| `Q` | ~25% | Adatto per codici stampati |
| `H` | ~30% | Ideale per codici con logo in sovraimpressione |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Codice QR personalizzato con colori custom:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- Questo endpoint accetta JSON, non dati form multipart, poiché non serve caricare alcuna immagine.
- L'output è sempre un'immagine PNG.
- Il nome file di output è sempre `qrcode.png`.
- `originalSize` è sempre 0 poiché questo strumento genera immagini da zero.
- Attorno al codice QR è inclusa una zona di silenzio (margine) di 2 moduli.
- La lunghezza massima del testo è 2000 caratteri. La capacità effettiva dipende dal livello di correzione degli errori e dalla codifica dei caratteri.
- Livelli di correzione degli errori più alti consentono al codice QR di rimanere scansionabile anche se parzialmente oscurato, ma riducono la capacità di dati.
- Quando viene fornito un `logoDataUri`, la correzione degli errori viene automaticamente forzata a `H` (30%) affinché il codice QR rimanga scansionabile nonostante il logo occluda il centro.
