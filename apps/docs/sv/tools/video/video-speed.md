---
description: "Snabba upp eller sakta ner en video."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: a23308e3c43e
---

# Videohastighet {#video-speed}

Snabba upp eller sakta ner en video med ett alternativ för att bevara ljudets tonhöjd.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| factor | number | Nej | `2` | Hastighetsmultiplikator (0.25-4). Värden över 1 snabbar upp, under 1 saktar ner |
| keepPitch | boolean | Nej | `true` | Bevara ljudets tonhöjd vid hastighetsändring |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Anteckningar {#notes}

- En faktor på `2` fördubblar uppspelningshastigheten (halverar längden). En faktor på `0.5` halverar uppspelningshastigheten (fördubblar längden).
- När `keepPitch` är `true` tidssträcks ljudet så att röster låter naturliga. När `false` förskjuts tonhöjden proportionellt med hastigheten.
- Det giltiga intervallet är 0.25x till 4x.
