---
description: "Extrahera bildrutor från en video som en ZIP med bilder."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: c9993f561039
---

# Video till bildrutor {#video-to-frames}

Extrahera enskilda bildrutor från en video och ladda ner dem som ett ZIP-arkiv med PNG- eller JPG-bilder.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| mode | string | Nej | `"all"` | Extraheringsläge: `all`, `nth`, `timestamps` |
| n | integer | Nej | `10` | Extrahera var N:e bildruta (2-1000). Används endast när mode är `"nth"` |
| timestamps | string | Nej | `""` | Kommaseparerade tidsstämplar i sekunder. Obligatorisk när mode är `"timestamps"` |
| format | string | Nej | `"png"` | Bildformat för extraherade bildrutor: `png`, `jpg` |

## Exempelbegäran {#example-request}

Extrahera var 30:e bildruta som JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Extrahera bildrutor vid specifika tidsstämplar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Anteckningar {#notes}

- Läget `all` extraherar varje bildruta och kan producera mycket stora ZIP-filer för långa videor. Använd läget `nth` eller `timestamps` för selektiv extrahering.
- PNG bevarar full kvalitet men producerar större filer. JPG är mindre men förstörande.
- Svaret laddas ner som ett ZIP-arkiv som innehåller sekventiellt numrerade bildfiler.
