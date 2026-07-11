---
description: "Frames uit een video halen als een ZIP met afbeeldingen."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 39fce0ef9ffc
---

# Video to Frames {#video-to-frames}

Haal individuele frames uit een video en download ze als een ZIP-archief met PNG- of JPG-afbeeldingen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Nee | `"all"` | Extractiemodus: `all`, `nth`, `timestamps` |
| n | integer | Nee | `10` | Elk Nde frame extraheren (2-1000). Alleen gebruikt wanneer mode `"nth"` is |
| timestamps | string | Nee | `""` | Door komma's gescheiden tijdstempels in seconden. Vereist wanneer mode `"timestamps"` is |
| format | string | Nee | `"png"` | Afbeeldingsformaat voor geëxtraheerde frames: `png`, `jpg` |

## Example Request {#example-request}

Elk 30ste frame extraheren als JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Frames op specifieke tijdstempels extraheren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- De modus `all` extraheert elk frame en kan voor lange video's zeer grote ZIP-bestanden opleveren. Gebruik de modus `nth` of `timestamps` voor selectieve extractie.
- PNG behoudt de volledige kwaliteit maar produceert grotere bestanden. JPG is kleiner maar lossy.
- De respons downloadt als een ZIP-archief met opeenvolgend genummerde afbeeldingsbestanden.
