---
description: "AI-driven bakgrundsborttagning med valfria effekter (oskärpa, skugga, gradient, egen bakgrund)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: ce3b9e180575
---

# Ta bort bakgrund {#remove-background}

AI-driven bakgrundsborttagning med valfria effekter (oskärpa, skugga, gradient, egen bakgrund).

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Bearbetning:** Asynkron (returnerar 202, polla `/api/v1/jobs/{jobId}/progress` för status via SSE)

**Modellpaket:** `background-removal` (4-5 GB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| model | string | Nej | - | AI-modellvariant att använda |
| backgroundType | string | Nej | `"transparent"` | En av: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Nej | - | Hex-färg för enfärgad bakgrund |
| gradientColor1 | string | Nej | - | Första gradientfärgen |
| gradientColor2 | string | Nej | - | Andra gradientfärgen |
| gradientAngle | number | Nej | - | Gradientvinkel i grader |
| blurEnabled | boolean | Nej | - | Aktivera bakgrundsoskärpa |
| blurIntensity | number | Nej | - | Oskärpans intensitet (0-100) |
| shadowEnabled | boolean | Nej | - | Aktivera slagskugga på motivet |
| shadowOpacity | number | Nej | - | Skuggans opacitet (0-100) |
| outputFormat | string | Nej | - | Utdataformat: `png`, `webp` eller `avif` |
| edgeRefine | integer | Nej | - | Nivå för kantförfining (0-3) |
| decontaminate | boolean | Nej | - | Ta bort färgblödning från kanter |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Slutresultat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effektslutpunkt (fas 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Återapplicerar bakgrundseffekter utan att köra AI-modellen igen. Använder cachad mask och original från fas 1.

### Parametrar {#parameters-1}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| settings | JSON | Ja | - | JSON med effektinställningar (se nedan) |
| backgroundImage | file | Nej | - | Egen bakgrundsbild (när backgroundType är `image`) |

#### JSON-fält i settings {#settings-json-fields}

| Fält | Typ | Obligatorisk | Beskrivning |
|-------|------|----------|-------------|
| jobId | string | Ja | Jobb-ID från fas 1 |
| filename | string | Ja | Ursprungligt filnamn från fas 1 |
| backgroundType | string | Nej | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Nej | Hex-färg för enfärgad bakgrund |
| gradientColor1 | string | Nej | Första gradientfärgen |
| gradientColor2 | string | Nej | Andra gradientfärgen |
| gradientAngle | number | Nej | Gradientvinkel i grader |
| blurEnabled | boolean | Nej | Aktivera bakgrundsoskärpa |
| blurIntensity | number | Nej | Oskärpans intensitet (0-100) |
| shadowEnabled | boolean | Nej | Aktivera slagskugga |
| shadowOpacity | number | Nej | Skuggans opacitet (0-100) |
| outputFormat | string | Nej | `png`, `webp` eller `avif` |

### Exempelförfrågan {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Svar (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Anteckningar {#notes}

- Kräver att modellpaketet `background-removal` är installerat (4-5 GB).
- Fas 1 cachar den transparenta masken och originalbilden så att fas 2 (effekter) kan återapplicera olika bakgrunder omedelbart utan att köra AI-modellen igen.
- Stöder HEIC/HEIF-, RAW-, TGA-, PSD-, EXR- och HDR-indataformat via automatisk avkodning.
- EXIF-rotation korrigeras automatiskt före bearbetning.
