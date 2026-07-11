---
description: "Een video schalen naar een nieuwe resolutie of presetgrootte."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: cb1d84eb18a5
---

# Resize Video {#resize-video}

Schaal een video naar een nieuwe resolutie met aangepaste pixelafmetingen of een standaardpreset.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| width | integer | Nee | - | Doelbreedte in pixels (16-7680) |
| height | integer | Nee | - | Doelhoogte in pixels (16-4320) |
| preset | string | Nee | `"custom"` | Resolutiepreset: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Wanneer `preset` `"custom"` is, moet ten minste een van `width` of `height` worden opgegeven. De andere dimensie schaalt proportioneel mee.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Schalen naar aangepaste afmetingen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Presetwaarden komen overeen met standaardhoogtes (bijv. `720p` = 1280x720, `1080p` = 1920x1080). De breedte schaalt proportioneel mee vanuit de beeldverhouding van de bron.
- Afmetingen worden afgerond op even getallen, zoals de meeste videocodecs vereisen.
- De maximaal ondersteunde resolutie is 7680x4320 (8K UHD).
