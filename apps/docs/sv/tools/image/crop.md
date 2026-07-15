---
description: "Beskär bilder genom att ange ett område med position och dimensioner."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: 37bd3b1a4f17
---

# Beskär bild {#crop}

Beskär bilder genom att definiera ett rektangulärt område med hjälp av position och storlek. Stöder både pixel- och procentenheter.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/crop`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| left | number | Ja | - | X-förskjutning för beskärningsområdet (från vänsterkanten) |
| top | number | Ja | - | Y-förskjutning för beskärningsområdet (från överkanten) |
| width | number | Ja | - | Bredd på beskärningsområdet |
| height | number | Ja | - | Höjd på beskärningsområdet |
| unit | string | Nej | `"px"` | Enhet för värdena: `px` eller `percent` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Beskär med procentvärden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Anteckningar {#notes}

- Beskärningsområdet måste rymmas inom bildens gränser. Om området sträcker sig utanför bilden misslyckas begäran.
- När enheten `percent` används representerar värdena procent av bildens dimensioner (t.ex. innebär `left: 10` 10 % från vänsterkanten).
- Utdataformatet matchar indataformatet.
- EXIF-orientering tillämpas automatiskt före beskärning, så koordinaterna motsvarar den visuellt korrekta orienteringen.
