---
description: "Ta bort metadata från en video och rapportera vad som hittades."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 3810cb71b19c
---

# Rensa videometadata {#clean-video-metadata}

Ta bort metadata (skapelsedatum, GPS-koordinater, kameramodell, programvarutaggar osv.) från en video och rapportera vad som togs bort.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Tar emot multipart-formulärdata med en videofil. Detta verktyg har inga konfigurerbara inställningar.

## Parametrar {#parameters}

Detta verktyg har inga parametrar. Det tar bort all metadata från videocontainern.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Anteckningar {#notes}

- Borttagen metadata inkluderar skapelsetidsstämplar, GPS-/platsdata, kamera-/enhetsinformation och programvarutaggar.
- Video- och ljudströmmarna kopieras utan omkodning, så det finns ingen kvalitetsförlust.
- Användbart för integritet innan videor delas offentligt.
