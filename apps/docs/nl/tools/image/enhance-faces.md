---
description: "Herstel en verscherp wazige of gezichten van lage kwaliteit in afbeeldingen met de AI-modellen GFPGAN en CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: aba2ce3d7b1e
---

# Gezichtsverbetering {#face-enhancement}

Herstel en verbeter gezichten in afbeeldingen met AI-modellen (GFPGAN/CodeFormer).

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Verwerking:** Asynchroon (geeft 202 terug, poll `/api/v1/jobs/{jobId}/progress` voor de status via SSE)

**Modelbundels:** `upscale-enhance` (5-6 GB) en `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| model | string | Nee | `"auto"` | Te gebruiken model: `auto`, `gfpgan`, `codeformer` |
| strength | number | Nee | `0.8` | Verbeteringssterkte (0-1). Hogere waarden geven een sterkere verbetering |
| onlyCenterFace | boolean | Nee | `false` | Verbeter alleen het meest centrale/prominente gezicht |
| sensitivity | number | Nee | `0.5` | Gevoeligheid van de gezichtsdetectie (0-1) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Eindresultaat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Opmerkingen {#notes}

- Vereist zowel de modelbundel `upscale-enhance` (5-6 GB) als de modelbundel `face-detection` (200-300 MB).
- GFPGAN produceert een agressievere verbetering; CodeFormer behoudt de identiteit beter. `auto` selecteert het beste model voor de invoer.
- De uitvoer is altijd in PNG-formaat voor maximale kwaliteit.
- Naast de uitvoer met volledige resolutie wordt een WebP-voorbeeld gegenereerd voor een snellere weergave in de frontend.
- De parameter `strength` mengt het verbeterde gezicht met het origineel. Gebruik lagere waarden (0.3-0.5) voor subtiele verbeteringen en hogere waarden (0.7-1.0) voor een sterker herstel.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
