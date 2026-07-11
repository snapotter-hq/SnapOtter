---
description: "Ta bort oönskade objekt från bilder med AI-inpainting (LaMa), styrt av en mask över området som ska raderas."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 6799409ece49
---

# Objektradering {#object-eraser}

Ta bort oönskade objekt från bilder med AI-inpainting (LaMa-modellen). Tar emot en bild och en mask som anger området som ska raderas.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Bearbetning:** Asynkron (returnerar 202, hämta status via SSE på `/api/v1/jobs/{jobId}/progress`)

**Modellpaket:** `object-eraser-colorize` (1-2 GB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Källbildfil (multipart) |
| mask | file | Ja | - | Maskbild (vit = område att radera, svart = behåll). Måste laddas upp med fältnamnet `mask` |
| format | string | Nej | `"auto"` | Utdataformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Nej | `95` | Utdatakvalitet (1-100) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
```

## Svar {#response}

### Inledande svar (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Förlopp (SSE på `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Slutresultat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Anteckningar {#notes}

- Kräver att modellpaketet `object-eraser-colorize` är installerat (1-2 GB).
- Masken måste ha samma dimensioner som källbilden. Vita pixlar anger områden att radera; AI:n fyller dem med troligt innehåll.
- Använder LaMa (Large Mask Inpainting) för objektborttagning av hög kvalitet.
- För utdataformat som inte kan förhandsgranskas i webbläsaren genereras en WebP-förhandsgranskning vid sidan av huvudutdatan.
- Stöder indataformaten HEIC/HEIF, RAW, TGA, PSD, EXR och HDR via automatisk avkodning.
