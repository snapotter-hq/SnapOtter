---
description: "AI-aangedreven verwijdering van ruis en korrel met kwaliteitsopties in meerdere niveaus."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 30c99b9780d4
---

# Noise Removal {#noise-removal}

AI-aangedreven verwijdering van ruis en korrel met kwaliteitsopties in meerdere niveaus, via de Python-sidecar (SCUNet-model).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Verwerking:** Asynchroon (geeft 202 terug, poll `/api/v1/jobs/{jobId}/progress` voor status via SSE)

**Modelbundel:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| tier | string | Nee | `"balanced"` | Kwaliteitsniveau: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Nee | `50` | Sterkte van ruisonderdrukking (0-100) |
| detailPreservation | number | Nee | `50` | Hoeveel detail behouden blijft (0-100). Hogere waarden behouden meer textuur |
| colorNoise | number | Nee | `30` | Sterkte van kleurruisonderdrukking (0-100) |
| format | string | Nee | `"original"` | Uitvoerformaat: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nee | `90` | Coderingskwaliteit van de uitvoer (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notes {#notes}

- Vereist dat de modelbundel `upscale-enhance` is geïnstalleerd (5-6 GB).
- Kwaliteitsniveaus wisselen snelheid uit tegen kwaliteit: `quick` is het snelst met basale ruisonderdrukking, `maximum` gebruikt de meest grondige multi-pass-aanpak.
- De parameter `detailPreservation` is cruciaal voor onderwerpen met textuur (stof, haar, gebladerte). Hogere waarden voorkomen dat de ruisonderdrukker fijne details wegwerkt.
- Wanneer `format` is ingesteld op `"original"`, komt het uitvoerformaat overeen met het formaat van het invoerbestand.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
