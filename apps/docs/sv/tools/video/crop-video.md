---
description: "Beskär en region ur en video."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: d51cf160a512
---

# Beskär video {#crop-video}

Beskär en rektangulär region ur en video genom att ange regionens storlek och position.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| width | integer | Ja | - | Bredd på beskärningsregionen i pixlar (minimum 16) |
| height | integer | Ja | - | Höjd på beskärningsregionen i pixlar (minimum 16) |
| x | integer | Nej | `0` | Horisontell förskjutning från övre vänstra hörnet |
| y | integer | Nej | `0` | Vertikal förskjutning från övre vänstra hörnet |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Anteckningar {#notes}

- Beskärningsregionen måste rymmas inom videons dimensioner. Om `x + width` eller `y + height` överskrider källstorleken returnerar begäran ett 400-fel.
- Minsta beskärningsstorlek är 16x16 pixlar.
- Dimensioner avrundas till jämna tal enligt kraven hos de flesta videocodecs.
