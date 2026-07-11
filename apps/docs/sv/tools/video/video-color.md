---
description: "Justera ljusstyrka, kontrast, mättnad och gamma för en video."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 8dc388c08e2d
---

# Videofärg {#video-color}

Justera ljusstyrka, kontrast, mättnad och gammakorrigering på en video.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| brightness | number | Nej | `0` | Ljusstyrkejustering (-1 till 1) |
| contrast | number | Nej | `1` | Kontrastmultiplikator (0-4) |
| saturation | number | Nej | `1` | Mättnadsmultiplikator (0-3). Sätt till 0 för gråskala |
| gamma | number | Nej | `1` | Gammakorrigering (0.1-10) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Anteckningar {#notes}

- Alla värden vid sina standardvärden (ljusstyrka 0, kontrast 1, mättnad 1, gamma 1) ger ingen förändring.
- Att sätta mättnad till `0` konverterar videon till gråskala.
- Gammavärden under 1 ljusar upp skuggor, medan värden över 1 mörkar dem.
