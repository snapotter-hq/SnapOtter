---
description: "Converteer tussen mono en stereo of wissel het linker- en rechterkanaal om."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 156cb4586783
---

# Audio Channels {#audio-channels}

Converteer audio tussen mono- en stereolay-outs, of wissel het linker- en rechterkanaal van een stereobestand om.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Ja | - | Kanaalbewerking: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Opmerkingen {#notes}

- `stereo-to-mono` mixt beide kanalen tot één enkel monospoor.
- `mono-to-stereo` dupliceert het monokanaal naar zowel links als rechts.
- `swap` wisselt het linker- en rechterkanaal van een stereobestand om.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt geschreven als M4A, en niet-ondersteunde decode-only-invoer valt terug op MP3.
