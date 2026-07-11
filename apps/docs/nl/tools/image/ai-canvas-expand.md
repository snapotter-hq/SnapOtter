---
description: "Breid een afbeeldingscanvas uit met AI-outpainting, verleng het in elke richting en vul nieuwe gebieden om bij het origineel aan te sluiten."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: f36c3e92ca1b
---

# AI-canvas uitbreiden {#ai-canvas-expand}

Breid het canvas van een afbeelding uit met AI-gestuurde invulling (outpainting). Verlengt de afbeelding in elke richting en vult de nieuwe gebieden met AI-gegenereerde content die aansluit op de bestaande afbeelding.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Verwerking:** Asynchroon (retourneert 202, poll `/api/v1/jobs/{jobId}/progress` voor de status via SSE)

**Modelbundel:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| extendTop | integer | Nee | `0` | Pixels om bovenaan uit te breiden |
| extendRight | integer | Nee | `0` | Pixels om rechts uit te breiden |
| extendBottom | integer | Nee | `0` | Pixels om onderaan uit te breiden |
| extendLeft | integer | Nee | `0` | Pixels om links uit te breiden |
| tier | string | Nee | `"balanced"` | Kwaliteitsniveau: `fast`, `balanced`, `high` |
| format | string | Nee | `"auto"` | Uitvoerformaat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Nee | `95` | Uitvoerkwaliteit (1-100) |

Ten minste één uitbreidingsrichting moet groter zijn dan 0.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Antwoord {#response}

### Initieel antwoord (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Voortgang (SSE op `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Eindresultaat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Opmerkingen {#notes}

- Vereist dat de modelbundel `object-eraser-colorize` is geïnstalleerd (1-2 GB).
- Gebruikt op LaMa gebaseerde outpainting om content voor de uitgebreide gebieden te genereren.
- De parameter `tier` ruilt snelheid in voor kwaliteit: `fast` levert snel resultaten op met mogelijke artefacten, `high` duurt langer maar levert vloeiendere, samenhangender invullingen op.
- Uitbreidingswaarden zijn in pixels. De uiteindelijke afmetingen van de afbeelding worden: originele breedte + extendLeft + extendRight bij originele hoogte + extendTop + extendBottom.
- Voor uitvoerformaten die niet in de browser kunnen worden bekeken (HEIC, JXL, TIFF) wordt naast de hoofduitvoer een WebP-voorbeeld gegenereerd.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
