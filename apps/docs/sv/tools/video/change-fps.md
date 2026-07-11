---
description: "Ändra bildhastigheten för en video."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: bc8c2f68fdfb
---

# Ändra FPS {#change-fps}

Ändra bildhastigheten för en video till ett målvärde mellan 1 och 120 fps.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| fps | number | Nej | `30` | Målbildhastighet (1-120) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Anteckningar {#notes}

- Att sänka bildhastigheten släpper bildrutor och minskar filstorleken. Att öka den duplicerar bildrutor för att fylla luckan men tillför ingen verklig rörelsedetalj.
- Vanliga målvärden: 24 (bio), 30 (webb/broadcast), 60 (jämn uppspelning).
- Ljudspåret bevaras med sin ursprungliga samplingsfrekvens.
