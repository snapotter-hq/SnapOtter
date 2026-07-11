---
description: "Verwijder ongewenste objecten uit afbeeldingen met AI-inpainting (LaMa), gestuurd door een masker van het te wissen gebied."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 17e88f9db53f
---

# Objectgum {#object-eraser}

Verwijder ongewenste objecten uit afbeeldingen met AI-inpainting (LaMa-model). Accepteert een afbeelding en een masker dat het te wissen gebied aangeeft.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Verwerking:** Asynchroon (geeft 202 terug, poll `/api/v1/jobs/{jobId}/progress` voor de status via SSE)

**Modelbundel:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bronafbeeldingsbestand (multipart) |
| mask | file | Ja | - | Maskerafbeelding (wit = te wissen gebied, zwart = behouden). Moet worden geüpload met veldnaam `mask` |
| format | string | Nee | `"auto"` | Uitvoerformaat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Nee | `95` | Uitvoerkwaliteit (1-100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
```

## Antwoord {#response}

### Eerste antwoord (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Voortgang (SSE op `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Eindresultaat (via SSE) {#final-result-via-sse}

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

## Opmerkingen {#notes}

- Vereist dat de modelbundel `object-eraser-colorize` is geïnstalleerd (1-2 GB).
- Het masker moet dezelfde afmetingen hebben als de bronafbeelding. Witte pixels geven te wissen gebieden aan; de AI vult ze op met plausibele inhoud.
- Gebruikt LaMa (Large Mask Inpainting) voor objectverwijdering van hoge kwaliteit.
- Voor uitvoerformaten die niet in de browser kunnen worden bekeken, wordt naast de hoofduitvoer een WebP-voorbeeld gegenereerd.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
