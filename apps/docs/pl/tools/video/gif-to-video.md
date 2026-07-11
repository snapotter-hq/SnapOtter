---
description: "Konwersja animowanego GIF na wideo MP4, WebM lub MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: d2dc6f99ecc0
---

# GIF to Video {#gif-to-video}

Konwertuje animowany GIF na kompaktowy plik wideo MP4, WebM lub MOV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Przyjmuje dane formularza multipart z plikiem GIF i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Nie | `"mp4"` | Format wyjściowy: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Konwersja GIF na wideo zazwyczaj zmniejsza rozmiar pliku o 80-90%, zachowując tę samą jakość wizualną.
- Przyjmowane są tylko animowane pliki GIF. Obrazy statyczne powinny korzystać z narzędzia Convert dla obrazów.
- MP4 i MOV używają kodowania H.264, WebM używa VP9.
