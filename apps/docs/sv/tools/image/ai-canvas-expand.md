---
description: "Utöka en bilds arbetsyta med AI-outpainting, förläng den i valfri riktning och fyll nya områden så att de matchar originalet."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 9ae62601de01
---

# AI-utökning av arbetsyta {#ai-canvas-expand}

Utöka en bilds arbetsyta med AI-driven ifyllnad (outpainting). Förlänger bilden i valfri riktning och fyller de nya områdena med AI-genererat innehåll som matchar den befintliga bilden.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Bearbetning:** Asynkron (returnerar 202, hämta status genom att polla `/api/v1/jobs/{jobId}/progress` via SSE)

**Modellpaket:** `object-eraser-colorize` (1-2 GB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | fil | Ja | - | Bildfil (multipart) |
| extendTop | heltal | Nej | `0` | Pixlar att förlänga upptill |
| extendRight | heltal | Nej | `0` | Pixlar att förlänga till höger |
| extendBottom | heltal | Nej | `0` | Pixlar att förlänga nedtill |
| extendLeft | heltal | Nej | `0` | Pixlar att förlänga till vänster |
| tier | sträng | Nej | `"balanced"` | Kvalitetsnivå: `fast`, `balanced`, `high` |
| format | sträng | Nej | `"auto"` | Utdataformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | heltal | Nej | `95` | Utdatakvalitet (1-100) |

Minst en förlängningsriktning måste vara större än 0.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Svar {#response}

### Första svaret (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Förlopp (SSE på `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Slutresultat (via SSE) {#final-result-via-sse}

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

## Anteckningar {#notes}

- Kräver att modellpaketet `object-eraser-colorize` är installerat (1-2 GB).
- Använder LaMa-baserad outpainting för att generera innehåll för de utökade områdena.
- Parametern `tier` byter hastighet mot kvalitet: `fast` ger resultat snabbt med potentiella artefakter, `high` tar längre tid men ger jämnare, mer sammanhängande ifyllnad.
- Förlängningsvärdena anges i pixlar. De slutliga bildmåtten blir: ursprunglig bredd + extendLeft + extendRight gånger ursprunglig höjd + extendTop + extendBottom.
- För utdataformat som inte kan förhandsvisas i webbläsare (HEIC, JXL, TIFF) genereras en WebP-förhandsvisning tillsammans med huvudutdata.
- Stöder indataformaten HEIC/HEIF, RAW, TGA, PSD, EXR och HDR via automatisk avkodning.
