---
description: "Åtgärda falskt transparenta PNG-filer med AI-matting (BiRefNet) för att skapa äkta alfa, plus kantrensning med defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: a690d4484bc8
---

# PNG-transparensfixare {#png-transparency-fixer}

Åtgärda falskt transparenta PNG-filer med ett klick. Använder AI-matting (BiRefNet HR Matting-modell) för att skapa äkta alfatransparens, med defringe-efterbearbetning för att rensa upp kanter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Processing:** Asynkron (returnerar 202, avfråga `/api/v1/jobs/{jobId}/progress` för status via SSE)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Bildfil (multipart) |
| defringe | number | No | `30` | Defringe-intensitet (0-100). Tar bort halvgenomskinliga kantpixlar runt kanterna |
| outputFormat | string | No | `"png"` | Utdataformat: `png` eller `webp` |
| removeWatermark | boolean | No | `false` | Tillämpa förbehandling för borttagning av vattenstämpel (medianfilter) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

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

## Notes {#notes}

- Kräver att modellpaketet `background-removal` är installerat (4-5 GB).
- Använder `birefnet-hr-matting` som primär modell för högkvalitativ alfa-matting. Faller tillbaka till `birefnet-general` om HR-modellen får slut på minne.
- Alternativet `defringe` tar bort halvgenomskinliga kantpixlar som AI-matting ibland lämnar kvar runt hår, päls och fina kanter. Det fungerar genom att göra alfakanalen oskarp och nollställa pixlar med låg tillförlitlighet.
- Alternativet `removeWatermark` tillämpar ett medianfilter som förbehandlingssteg. Det är en grundläggande vattenstämpelreducering, inte ett dedikerat verktyg för borttagning av vattenstämplar.
- Ger endast utdata i PNG eller förlustfri WebP (båda stöder alfatransparens).
- Stöder indataformaten HEIC/HEIF, RAW, TGA, PSD, EXR och HDR via automatisk avkodning.
