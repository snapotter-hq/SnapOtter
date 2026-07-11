---
description: "Jämför två bilder sida vid sida med diffvisualisering på pixelnivå och likhetspoäng."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: 0497fe00ebdb
---

# Bildjämförelse {#image-compare}

Ladda upp två bilder för att beräkna en skillnadskarta på pixelnivå och en numerisk likhetsprocent. Utdatan är en diffbild som markerar ändrade områden i rött.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/compare`

Tar emot multipart-formulärdata med **två** bildfiler. Inget inställningsfält behövs.

## Parametrar {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp exakt två bildfiler.

| Fält | Typ | Obligatorisk | Beskrivning |
|-------|------|----------|-------------|
| file (första) | file | Ja | Den första bilden |
| file (andra) | file | Ja | Den andra bilden |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Svarsfält {#response-fields}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| jobId | string | Jobbidentifierare för att ladda ner diffbilden |
| similarity | number | Procentuell likhet mellan de två bilderna (0 till 100) |
| dimensions | object | Bredd och höjd som används för jämförelsen |
| downloadUrl | string | URL för att ladda ner den genererade diffbilden |
| originalSize | number | Sammanlagd storlek på båda indatabilderna i byte |
| processedSize | number | Storlek på diffutdatabilden i byte |

## Anteckningar {#notes}

- Båda bilderna storleksändras till samma dimensioner (maxvärdet för respektive axel) före jämförelsen.
- Diffbilden markerar skillnader i rött med en opacitet som är proportionell mot ändringens storlek. Identiska eller nästan identiska pixlar (skillnad < 10) visas som halvtransparenta versioner av originalet.
- Likheten beräknas som inversen av den genomsnittliga pixelskillnaden över alla pixlar, uttryckt i procent.
- En likhet på 100 % innebär att bilderna är pixelidentiska (vid jämförelseupplösningen).
- Diffutdatan är alltid i PNG-format oavsett indataformat.
- Båda bilderna valideras och avkodas (HEIC, RAW, PSD, SVG stöds) före jämförelsen.
- EXIF-orientering tillämpas automatiskt på båda bilderna före bearbetning.
