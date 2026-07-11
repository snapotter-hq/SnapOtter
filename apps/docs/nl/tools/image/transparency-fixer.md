---
description: "Nep-transparante PNG's repareren met AI-matting (BiRefNet) voor echte alfa, plus opschoning van randen met defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 77fd40598bca
---

# PNG-transparantiehersteller {#png-transparency-fixer}

Repareer nep-transparante PNG's met één klik. Gebruikt AI-matting (BiRefNet HR Matting-model) om echte alfatransparantie te produceren, met defringe-nabewerking om randen op te schonen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Verwerking:** Asynchroon (retourneert 202, poll `/api/v1/jobs/{jobId}/progress` voor de status via SSE)

**Modelbundel:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| defringe | number | Nee | `30` | Defringe-intensiteit (0-100). Verwijdert semitransparante randpixels rond de randen |
| outputFormat | string | Nee | `"png"` | Uitvoerformaat: `png` of `webp` |
| removeWatermark | boolean | Nee | `false` | Pas voorbewerking voor watermerkverwijdering toe (mediaanfilter) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
```

## Respons {#response}

### Eerste respons (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Voortgang (SSE op `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Eindresultaat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Opmerkingen {#notes}

- Vereist dat de modelbundel `background-removal` is geïnstalleerd (4-5 GB).
- Gebruikt `birefnet-hr-matting` als primair model voor hoogwaardige alfamatting. Valt terug op `birefnet-general` als het HR-model onvoldoende geheugen heeft.
- De optie `defringe` verwijdert semitransparante randpixels die AI-matting soms achterlaat rond haar, vacht en fijne randen. Het werkt door het alfakanaal te vervagen en pixels met een lage betrouwbaarheid op nul te zetten.
- De optie `removeWatermark` past een voorbewerkingsstap met een mediaanfilter toe. Het is een basale watermerkvermindering, geen speciaal gereedschap voor watermerkverwijdering.
- Levert alleen PNG of lossless WebP (beide ondersteunen alfatransparantie).
- Ondersteunt HEIC-/HEIF-, RAW-, TGA-, PSD-, EXR- en HDR-invoerformaten via automatische decodering.
