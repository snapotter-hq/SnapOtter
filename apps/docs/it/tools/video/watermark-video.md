---
description: "Applica una filigrana di testo sui fotogrammi del video."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 7ab772e97acf
---

# Watermark Video {#watermark-video}

Applica una filigrana di testo su ogni fotogramma di un video con posizione, dimensione, opacità e colore configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Testo della filigrana (1-200 caratteri) |
| position | string | No | `"br"` | Posizione sul fotogramma: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Dimensione del carattere in pixel (8-120) |
| opacity | number | No | `0.5` | Opacità della filigrana (0.05-1) |
| color | string | No | `"#ffffff"` | Colore esadecimale per il testo (ad es. `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - In alto a sinistra, **tc** - In alto al centro, **tr** - In alto a destra
- **l** - Al centro a sinistra, **c** - Al centro, **r** - Al centro a destra
- **bl** - In basso a sinistra, **bc** - In basso al centro, **br** - In basso a destra

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- La filigrana viene renderizzata in modo permanente nei fotogrammi del video e non può essere rimossa dopo l'elaborazione.
- La filigrana usa un carattere sans-serif integrato in FFmpeg.
- Per filigrane con immagini, usa invece lo strumento Watermark delle immagini.
