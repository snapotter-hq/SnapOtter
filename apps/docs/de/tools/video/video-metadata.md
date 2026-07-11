---
description: "Metadaten aus einem Video entfernen und melden, was gefunden wurde."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 1656eeff847e
---

# Clean Video Metadata {#clean-video-metadata}

Metadaten (Erstellungsdatum, GPS-Koordinaten, Kameramodell, Software-Tags usw.) aus einem Video entfernen und melden, was entfernt wurde.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Nimmt Multipart-Formulardaten mit einer Videodatei entgegen. Dieses Tool hat keine konfigurierbaren Einstellungen.

## Parameters {#parameters}

Dieses Tool hat keine Parameter. Es entfernt alle Metadaten aus dem Videocontainer.

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

- Zu den entfernten Metadaten gehören Erstellungszeitstempel, GPS-/Standortdaten, Kamera-/Geräteinformationen und Software-Tags.
- Die Video- und Audiostreams werden ohne Neukodierung kopiert, sodass kein Qualitätsverlust auftritt.
- Nützlich für den Datenschutz, bevor Videos öffentlich geteilt werden.
