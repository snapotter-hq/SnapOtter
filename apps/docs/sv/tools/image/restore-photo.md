---
description: "Reparera repor, revor och skador på gamla foton med en AI-pipeline för restaurering, ansiktsförbättring och färg."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 08f82fb45502
---

# Fotorestaurering {#photo-restoration}

Åtgärda repor, revor och skador på gamla foton med en AI-pipeline i flera steg. Kombinerar reparation av repor, ansiktsförbättring, brusreducering och valfri färgläggning.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Bearbetning:** Asynkron (returnerar 202, polla `/api/v1/jobs/{jobId}/progress` för status via SSE)

**Modellpaket:** `photo-restoration` (4-5 GB)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| scratchRemoval | boolean | Nej | `true` | Ta bort repor och ytskador |
| faceEnhancement | boolean | Nej | `true` | Förbättra ansikten i det restaurerade fotot |
| fidelity | number | Nej | `0.7` | Trohet för ansiktsförbättring (0-1). Högre värden bevarar originaldragen mer |
| denoise | boolean | Nej | `true` | Applicera brusreducering på det restaurerade resultatet |
| denoiseStrength | number | Nej | `25` | Brusreduceringsstyrka (0-100) |
| colorize | boolean | Nej | `false` | Färglägg det restaurerade fotot (för gråskalebilder) |
| colorizeStrength | number | Nej | `85` | Färgläggningsintensitet (0-100) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Slutresultat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Anteckningar {#notes}

- Kräver att modellpaketet `photo-restoration` är installerat (4-5 GB).
- Pipelinen kör flera AI-steg i följd: reparation av repor, ansiktsförbättring (GFPGAN), brusreducering och valfritt färgläggning.
- Arrayen `steps` i resultatet visar vilka bearbetningssteg som faktiskt utfördes.
- `scratchCoverage` är en uppskattad procentandel av bildytan som hade reporskador.
- `fidelity` styr hur starkt ansikten förbättras kontra att originalets utseende bevaras. Lägre värden ger mer aggressiv förbättring; högre värden är mer konservativa.
- Alternativet `colorize` detekterar automatiskt om bilden är gråskala. Flaggan `isGrayscale` i resultatet bekräftar denna detektering.
- Utdataformatet matchar indataformatet automatiskt.
- Stöder HEIC/HEIF-, RAW-, TGA-, PSD-, EXR-, HDR- och AVIF-indataformat via automatisk avkodning.
