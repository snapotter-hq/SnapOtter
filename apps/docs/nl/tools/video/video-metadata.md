---
description: "Metadata uit een video verwijderen en rapporteren wat er is gevonden."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: adb80ec9234b
---

# Clean Video Metadata {#clean-video-metadata}

Verwijder metadata (aanmaakdatum, GPS-coördinaten, cameramodel, softwaretags, enz.) uit een video en rapporteer wat er is verwijderd.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Accepteert multipart form data met een videobestand. Deze tool heeft geen instelbare opties.

## Parameters {#parameters}

Deze tool heeft geen parameters. Het verwijdert alle metadata uit de videocontainer.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

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

## Notes {#notes}

- Verwijderde metadata omvat aanmaaktijdstempels, GPS-/locatiegegevens, camera-/apparaatinfo en softwaretags.
- Het beeld- en audiospoor worden gekopieerd zonder opnieuw te encoderen, dus er is geen kwaliteitsverlies.
- Handig voor privacy voordat je video's openbaar deelt.
