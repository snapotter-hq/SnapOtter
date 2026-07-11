---
description: "Kleur zwart-witfoto's of grijstintfoto's automatisch in met het DDColor-AI-model."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: cd14b6c93eed
---

# AI-inkleuring {#ai-colorization}

Zet zwart-witfoto's of grijstintfoto's om naar volledige kleur met AI (DDColor-model met OpenCV DNN als terugval).

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Verwerking:** Asynchroon (geeft 202 terug, poll `/api/v1/jobs/{jobId}/progress` voor de status via SSE)

**Modelbundel:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| intensity | number | Nee | `1.0` | Kleurintensiteit (0-1). Lagere waarden geven subtielere inkleuring |
| model | string | Nee | `"auto"` | Te gebruiken model: `auto`, `ddcolor`, `opencv` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Eindresultaat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Opmerkingen {#notes}

- Vereist dat de modelbundel `object-eraser-colorize` is geïnstalleerd (1-2 GB).
- DDColor levert resultaten van hogere kwaliteit maar is trager; OpenCV DNN is sneller met een iets lagere kwaliteit. `auto` gebruikt DDColor indien beschikbaar, met OpenCV als terugval.
- De parameter `intensity` mengt tussen het originele grijstintbeeld en het door AI ingekleurde resultaat. Gebruik 1.0 voor volledige kleur en lagere waarden voor een gedeeltelijk ontzadigde vintage look.
- Het uitvoerformaat komt automatisch overeen met het invoerformaat.
- Voor uitvoerformaten die niet in de browser kunnen worden bekeken, wordt naast de hoofduitvoer een WebP-voorbeeld gegenereerd.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
