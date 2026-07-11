---
description: "AI-aangedreven achtergrondverwijdering met optionele effecten (vervaging, schaduw, verloop, aangepaste achtergrond)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: b93aa329e2fa
---

# Remove Background {#remove-background}

AI-aangedreven achtergrondverwijdering met optionele effecten (vervaging, schaduw, verloop, aangepaste achtergrond).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Verwerking:** Asynchroon (geeft 202 terug, poll `/api/v1/jobs/{jobId}/progress` voor status via SSE)

**Modelbundel:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| model | string | Nee | - | Te gebruiken AI-modelvariant |
| backgroundType | string | Nee | `"transparent"` | Een van: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Nee | - | Hex-code voor een effen achtergrond |
| gradientColor1 | string | Nee | - | Eerste verloopkleur |
| gradientColor2 | string | Nee | - | Tweede verloopkleur |
| gradientAngle | number | Nee | - | Verloophoek in graden |
| blurEnabled | boolean | Nee | - | Achtergrondvervagingseffect inschakelen |
| blurIntensity | number | Nee | - | Vervagingsintensiteit (0-100) |
| shadowEnabled | boolean | Nee | - | Slagschaduw op het onderwerp inschakelen |
| shadowOpacity | number | Nee | - | Ondoorzichtigheid van de schaduw (0-100) |
| outputFormat | string | Nee | - | Uitvoerformaat: `png`, `webp` of `avif` |
| edgeRefine | integer | Nee | - | Niveau van randverfijning (0-3) |
| decontaminate | boolean | Nee | - | Kleurdoorbloeding aan de randen verwijderen |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

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

## Effects Endpoint (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Past achtergrondeffecten opnieuw toe zonder het AI-model opnieuw te draaien. Gebruikt het in de cache opgeslagen masker en origineel uit Fase 1.

### Parameters {#parameters-1}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| settings | JSON | Ja | - | JSON met effectinstellingen (zie hieronder) |
| backgroundImage | file | Nee | - | Aangepaste achtergrondafbeelding (wanneer backgroundType `image` is) |

#### Settings JSON fields {#settings-json-fields}

| Veld | Type | Vereist | Beschrijving |
|-------|------|----------|-------------|
| jobId | string | Ja | Job-ID uit Fase 1 |
| filename | string | Ja | Oorspronkelijke bestandsnaam uit Fase 1 |
| backgroundType | string | Nee | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Nee | Hex-code voor een effen achtergrond |
| gradientColor1 | string | Nee | Eerste verloopkleur |
| gradientColor2 | string | Nee | Tweede verloopkleur |
| gradientAngle | number | Nee | Verloophoek in graden |
| blurEnabled | boolean | Nee | Achtergrondvervaging inschakelen |
| blurIntensity | number | Nee | Vervagingsintensiteit (0-100) |
| shadowEnabled | boolean | Nee | Slagschaduw inschakelen |
| shadowOpacity | number | Nee | Ondoorzichtigheid van de schaduw (0-100) |
| outputFormat | string | Nee | `png`, `webp` of `avif` |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Notes {#notes}

- Vereist dat de modelbundel `background-removal` is geïnstalleerd (4-5 GB).
- Fase 1 slaat het transparante masker en de oorspronkelijke afbeelding op in de cache, zodat Fase 2 (effecten) direct verschillende achtergronden opnieuw kan toepassen zonder het AI-model opnieuw te draaien.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
- EXIF-rotatie wordt automatisch gecorrigeerd voordat er verwerkt wordt.
