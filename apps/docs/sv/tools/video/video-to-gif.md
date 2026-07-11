---
description: "Gör ett videoklipp till en animerad GIF."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 1a1bf6da84ca
---

# Video till GIF {#video-to-gif}

Gör ett videoklipp till en animerad GIF med konfigurerbar bildhastighet, bredd, starttid och längd.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`. Detta är en asynkron slutpunkt - den returnerar `202 Accepted` omedelbart och förloppet strömmas via SSE på `GET /api/v1/jobs/{jobId}/progress`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| fps | integer | Nej | `12` | Utdatabildhastighet (1-30) |
| width | integer | Nej | `480` | Utdatabredd i pixlar (64-1280). Höjden skalas proportionellt |
| startS | number | Nej | `0` | Starttid i sekunder (måste vara >= 0) |
| durationS | number | Nej | `5` | Längd i sekunder (över 0, max 60) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Anteckningar {#notes}

- Lägre värden på `fps` och `width` producerar mindre GIF-filer. En 480px bred GIF vid 12 fps är oftast en bra balans.
- Maximal längd är 60 sekunder. Längre klipp producerar mycket stora filer.
- Förloppsuppdateringar finns tillgängliga via SSE på `GET /api/v1/jobs/{jobId}/progress` tills jobbet är klart.
