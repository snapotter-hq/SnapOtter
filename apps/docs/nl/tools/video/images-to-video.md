---
description: "Een set afbeeldingen omzetten naar een diavoorstellingsvideo."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 3ac7b86f548d
---

# Images to Video {#images-to-video}

Zet een set afbeeldingen om naar een diavoorstellingsvideo met een instelbare duur per afbeelding, resolutie en framerate.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Accepteert multipart form data met twee of meer afbeeldingsbestanden en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | Nee | `2` | Weergaveduur per afbeelding in seconden (0.5-10) |
| resolution | string | Nee | `"720p"` | Uitvoerresolutie: `1080p`, `720p`, `square` |
| fps | integer | Nee | `30` | Uitvoerframerate (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Accepteert 2-60 afbeeldingsbestanden per verzoek. Afbeeldingen verschijnen in de video in de volgorde waarin ze zijn geüpload.
- Afbeeldingen worden geschaald en opgevuld om binnen de doelresolutie te passen, met behoud van de beeldverhouding.
- De resolutie-optie `square` produceert een video van 1080x1080, handig voor sociale media.
- Het uitvoerformaat is altijd MP4 (H.264).
