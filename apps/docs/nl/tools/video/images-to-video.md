---
description: "Zet een set afbeeldingen om naar een diavoorstellingsvideo, een geanimeerde GIF of een geanimeerde WebP."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 4f21874d74de
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Zet een set afbeeldingen om naar een diavoorstellingsvideo met een instelbare duur per afbeelding, resolutie en framerate, of naar een geanimeerde GIF of WebP met een vaste tijd per frame en een aantal herhalingen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Accepteert multipart form data met twee of meer afbeeldingsbestanden en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Nee | `"mp4"` | Uitvoerformaat: `mp4`, `gif`, `webp` |
| secondsPerImage | number | Nee | `2` | Alleen MP4. Weergaveduur per afbeelding in seconden (0.5-10) |
| resolution | string | Nee | `"720p"` | Alleen MP4. Uitvoerresolutie: `1080p`, `720p`, `square` |
| fps | integer | Nee | `30` | Alleen MP4. Uitvoerframerate (10-60) |
| frameDelayMs | integer | Nee | `500` | Alleen GIF en WebP. Hoe lang elke afbeelding zichtbaar is, in milliseconden (20-10000) |
| loop | integer | Nee | `0` | Alleen GIF en WebP. Hoe vaak de animatie wordt afgespeeld; `0` herhaalt eindeloos (0-100) |

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

Een geanimeerde GIF maken waarin elke afbeelding 200 ms te zien is:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- Bij MP4 worden afbeeldingen geschaald en opgevuld om binnen de doelresolutie te passen, met behoud van de beeldverhouding.
- De resolutie-optie `square` produceert een video van 1080x1080, handig voor sociale media.
- MP4-uitvoer is H.264 en heet `slideshow.mp4`.
- GIF- en WebP-uitvoer gebruikt de afmetingen van de eerste afbeelding. Afbeeldingen met andere afmetingen worden geschaald om erin te passen, en het overgebleven gebied is transparant. Het bestand heet `slideshow.gif` of `slideshow.webp`.
- GIF slaat frametijden op in honderdsten van een seconde, dus `frameDelayMs` wordt in een GIF afgerond op het dichtstbijzijnde veelvoud van 10 ms. WebP behoudt de exacte waarde.
- Grote animaties worden geweigerd in plaats van gebouwd: de framegrootte maal het aantal afbeeldingen moet onder dezelfde pixellimiet blijven die de GIF-tools gebruiken.
