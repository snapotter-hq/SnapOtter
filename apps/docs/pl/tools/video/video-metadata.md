---
description: "Usunięcie metadanych z wideo i raport, co zostało znalezione."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 03fe2ffe1858
---

# Clean Video Metadata {#clean-video-metadata}

Usuwa metadane (datę utworzenia, współrzędne GPS, model kamery, znaczniki oprogramowania itp.) z wideo i raportuje, co zostało usunięte.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Przyjmuje dane formularza multipart z plikiem wideo. To narzędzie nie ma konfigurowalnych ustawień.

## Parameters {#parameters}

To narzędzie nie ma parametrów. Usuwa wszystkie metadane z kontenera wideo.

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

- Usuwane metadane obejmują znaczniki czasu utworzenia, dane GPS/lokalizacji, informacje o kamerze/urządzeniu oraz znaczniki oprogramowania.
- Strumienie wideo i audio są kopiowane bez ponownego kodowania, więc nie ma utraty jakości.
- Przydatne do ochrony prywatności przed publicznym udostępnianiem filmów.
