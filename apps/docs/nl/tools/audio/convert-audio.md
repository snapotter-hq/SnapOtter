---
description: "Converteer audio tussen de formaten MP3, WAV, OGG, FLAC en M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 3a933cf08d88
---

# Convert Audio {#convert-audio}

Converteer audiobestanden tussen gangbare formaten waaronder MP3, WAV, OGG, FLAC en M4A, met configureerbare uitvoerbitrate en samplefrequentie.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `"mp3"` | Uitvoerformaat: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Nee | `192` | Uitvoerbitrate in kbps (32 tot 320) |
| sampleRate | integer | Nee | bronfrequentie | Uitvoersamplefrequentie in Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` of `96000`. Laat weg om de samplefrequentie van de bron te behouden |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Opmerkingen {#notes}

- Ondersteunde invoerformaten zijn onder meer MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF en OPUS.
- Bitrate is alleen van toepassing op lossy-formaten (MP3, OGG, M4A). Lossless-formaten zoals WAV en FLAC negeren deze instelling.
- MP3-uitvoer ondersteunt samplefrequenties tot 48000 Hz. De optie 96000 Hz is alleen van toepassing op WAV, OGG, FLAC en M4A.
- De MP3-bitrate wordt begrensd door de samplefrequentie: maximaal 64 kbps bij 8000 Hz en 160 kbps bij 16000 of 22050 Hz. Verzoeken boven deze limiet worden geweigerd in plaats van stilzwijgend verlaagd.
- De uitvoerbestandsnaam behoudt de oorspronkelijke naam met de nieuwe extensie.
