---
description: "Rotera bilder i valfri vinkel och vänd horisontellt eller vertikalt."
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: 79a7660c15b8
---

# Rotera & Vänd bild {#rotate-flip}

Rotera bilder i en godtycklig vinkel och/eller vänd dem horisontellt eller vertikalt. Rotations- och vändningsåtgärder kan kombineras i en enda förfrågan.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| angle | number | Nej | `0` | Rotationsvinkel i grader (medurs). Tar emot valfritt numeriskt värde. |
| horizontal | boolean | Nej | `false` | Vänd bilden horisontellt (spegla) |
| vertical | boolean | Nej | `false` | Vänd bilden vertikalt |

## Exempelförfrågan {#example-request}

Rotera 90 grader medurs:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Vänd horisontellt:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Rotera och vänd tillsammans:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Anteckningar {#notes}

- Rotation appliceras först, sedan vändningsåtgärder.
- Rotationer som inte är 90 grader (t.ex. 45 grader) förstorar arbetsytan för att rymma den roterade bilden, med transparent eller svart fyllning beroende på utdataformatet.
- Vanliga värden: 90, 180, 270 för kvartsvarvsrotationer.
- EXIF-orientering appliceras automatiskt före bearbetning, så rotationen är relativ till den visuella orienteringen.
