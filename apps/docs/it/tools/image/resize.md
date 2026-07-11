---
description: "Ridimensiona le immagini per pixel, percentuale o con modalità di adattamento."
i18n_source_hash: 00d1bffa4d38
i18n_provenance: human
i18n_output_hash: ebde5f2f8019
---

# Resize {#resize}

Ridimensiona le immagini specificando dimensioni esatte in pixel, un fattore di scala percentuale o una modalità di adattamento che controlla come l'immagine si adatta alle dimensioni target.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/resize`

Accetta dati form multipart con un file immagine e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Larghezza target in pixel (max 16383) |
| height | integer | No | - | Altezza target in pixel (max 16383) |
| fit | string | No | `"contain"` | Come l'immagine si adatta alle dimensioni: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | Impedisci l'ingrandimento se l'immagine è più piccola del target |
| percentage | number | No | - | Scala per percentuale (ad es. 50 per la metà della dimensione) |

Deve essere fornito almeno uno tra `width`, `height` o `percentage`.

### Fit Modes {#fit-modes}

- **contain** - Ridimensiona per rientrare nelle dimensioni, preservando il rapporto d'aspetto (può lasciare spazio vuoto)
- **cover** - Ridimensiona per coprire le dimensioni, preservando il rapporto d'aspetto (può ritagliare)
- **fill** - Deforma per corrispondere esattamente alle dimensioni (ignora il rapporto d'aspetto)
- **inside** - Come `contain`, ma riduce soltanto, non ingrandisce mai
- **outside** - Come `cover`, ma riduce soltanto, non ingrandisce mai

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Ridimensiona per percentuale:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- La dimensione massima è 16383 pixel su entrambi gli assi (limite di Sharp/libvips).
- Il formato di output corrisponde al formato di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
- L'orientamento EXIF viene applicato automaticamente prima del ridimensionamento.
- Il flag `withoutEnlargement` è utile per l'elaborazione in batch dove alcune immagini potrebbero già essere più piccole del target.
