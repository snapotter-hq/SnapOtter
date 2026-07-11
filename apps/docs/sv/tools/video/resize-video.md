---
description: "Skala en video till en ny upplösning eller förinställd storlek."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: 7d997faec991
---

# Ändra storlek på video {#resize-video}

Skala en video till en ny upplösning med anpassade pixeldimensioner eller en standardförinställning.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| width | integer | Nej | - | Målbredd i pixlar (16-7680) |
| height | integer | Nej | - | Målhöjd i pixlar (16-4320) |
| preset | string | Nej | `"custom"` | Upplösningsförinställning: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

När `preset` är `"custom"` måste minst en av `width` eller `height` anges. Den andra dimensionen skalas proportionellt.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Ändra storlek till anpassade dimensioner:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Anteckningar {#notes}

- Förinställningsvärden mappar till standardhöjder (t.ex. `720p` = 1280x720, `1080p` = 1920x1080). Bredden skalas proportionellt från källans bildförhållande.
- Dimensioner avrundas till jämna tal enligt kraven hos de flesta videocodecs.
- Maximalt stödd upplösning är 7680x4320 (8K UHD).
