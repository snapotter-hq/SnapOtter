---
description: "Converteer audio tussen de formaten MP3, WAV, OGG, FLAC en M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 3a933cf08d88
---

# Convert Audio {#convert-audio}

Converteer audiobestanden tussen gangbare formaten waaronder MP3, WAV, OGG, FLAC en M4A, met configureerbare uitvoerbitrate.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `"mp3"` | Uitvoerformaat: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Nee | `192` | Uitvoerbitrate in kbps (32 tot 320) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Opmerkingen {#notes}

- Ondersteunde invoerformaten zijn onder meer MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF en OPUS.
- Bitrate is alleen van toepassing op lossy-formaten (MP3, OGG, M4A). Lossless-formaten zoals WAV en FLAC negeren deze instelling.
- De uitvoerbestandsnaam behoudt de oorspronkelijke naam met de nieuwe extensie.
