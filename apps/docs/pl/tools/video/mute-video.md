---
description: "Usunięcie ścieżki audio z wideo."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 952891218501
---

# Mute Video {#mute-video}

Usuwa ścieżkę audio z wideo, pozostawiając tylko strumień wizualny.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Przyjmuje dane formularza multipart z plikiem wideo. To narzędzie nie ma konfigurowalnych ustawień.

## Parameters {#parameters}

To narzędzie nie ma parametrów. Usuwa ścieżkę audio z przesłanego wideo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Strumień wideo jest kopiowany bez ponownego kodowania, więc nie ma utraty jakości.
- Jeśli wejściowe wideo nie ma ścieżki audio, plik jest zwracany bez zmian.
