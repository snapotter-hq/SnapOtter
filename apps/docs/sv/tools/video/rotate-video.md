---
description: "Rotera eller vänd en video."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: ecc00615c658
---

# Rotera video {#rotate-video}

Rotera en video med 90, 180 eller 270 grader, eller vänd den horisontellt eller vertikalt.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| transform | string | Ja | - | Transformation att tillämpa: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transformvärden {#transform-values}

- **cw90** - Rotera 90 grader medurs
- **ccw90** - Rotera 90 grader moturs
- **180** - Rotera 180 grader
- **hflip** - Vänd horisontellt (spegla)
- **vflip** - Vänd vertikalt

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Anteckningar {#notes}

- Rotationer med 90 eller 270 grader byter plats på videons bredd och höjd.
- Vändoperationer (hflip, vflip) ändrar inte videons dimensioner.
