---
description: "Krymp videofilstorleken med kvalitetskontroll."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: c8050cf2ea62
---

# Komprimera video {#compress-video}

Krymp videofilstorleken med konfigurerbar komprimeringsstyrka och valfri nedskalning av upplösning.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`. Detta är en asynkron slutpunkt - den returnerar `202 Accepted` omedelbart och förloppet strömmas via SSE på `GET /api/v1/jobs/{jobId}/progress`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| quality | string | Nej | `"balanced"` | Komprimeringsstyrka: `light`, `balanced`, `strong` |
| resolution | string | Nej | `"original"` | Utdataupplösning: `original`, `1080p`, `720p`, `480p` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Anteckningar {#notes}

- Förinställningen `light` bevarar nära originalkvalitet. Förinställningen `strong` minskar filstorleken aggressivt på bekostnad av visuell trohet.
- Nedskalning av upplösning (t.ex. från 4K till 720p) kombineras med komprimering för betydande storleksminskning.
- Förloppsuppdateringar finns tillgängliga via SSE på `GET /api/v1/jobs/{jobId}/progress` tills jobbet är klart.
