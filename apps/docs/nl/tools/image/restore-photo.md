---
description: "Repareer krassen, scheuren en beschadigingen op oude foto's met een AI-pijplijn voor restauratie, gezichtsverbetering en kleur."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 798921d3e505
---

# Photo Restoration {#photo-restoration}

Herstel krassen, scheuren en beschadigingen op oude foto's met een AI-pijplijn in meerdere stappen. Combineert krasreparatie, gezichtsverbetering, ruisonderdrukking en optionele inkleuring.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Verwerking:** Asynchroon (geeft 202 terug, poll `/api/v1/jobs/{jobId}/progress` voor status via SSE)

**Modelbundel:** `photo-restoration` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| scratchRemoval | boolean | Nee | `true` | Krassen en oppervlakschade verwijderen |
| faceEnhancement | boolean | Nee | `true` | Gezichten in de gerestaureerde foto verbeteren |
| fidelity | number | Nee | `0.7` | Getrouwheid van de gezichtsverbetering (0-1). Hogere waarden behouden de originele kenmerken meer |
| denoise | boolean | Nee | `true` | Ruisonderdrukking toepassen op het gerestaureerde resultaat |
| denoiseStrength | number | Nee | `25` | Sterkte van de ruisonderdrukking (0-100) |
| colorize | boolean | Nee | `false` | De gerestaureerde foto inkleuren (voor grijswaardenafbeeldingen) |
| colorizeStrength | number | Nee | `85` | Intensiteit van de inkleuring (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

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

## Notes {#notes}

- Vereist dat de modelbundel `photo-restoration` is geïnstalleerd (4-5 GB).
- De pijplijn draait meerdere AI-stappen achter elkaar: krasreparatie, gezichtsverbetering (GFPGAN), ruisonderdrukking en optioneel inkleuring.
- De array `steps` in het resultaat toont welke verwerkingsstappen daadwerkelijk zijn uitgevoerd.
- `scratchCoverage` is een geschat percentage van het beeldoppervlak dat krasschade had.
- `fidelity` bepaalt hoe sterk gezichten worden verbeterd ten opzichte van het behouden van het originele uiterlijk. Lagere waarden geven een agressievere verbetering; hogere waarden zijn behoudender.
- De optie `colorize` detecteert automatisch of de afbeelding in grijswaarden is. De vlag `isGrayscale` in het resultaat bevestigt deze detectie.
- Het uitvoerformaat komt automatisch overeen met het invoerformaat.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR, HDR en AVIF via automatische decodering.
