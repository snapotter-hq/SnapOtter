---
description: "Zamiana ścieżki audio wideo na inny plik."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: cd1d2b22b7b0
---

# Replace Audio {#replace-audio}

Zamienia ścieżkę audio wideo na plik audio. Prześlij zarówno plik wideo, jak i plik audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Przyjmuje dane formularza multipart z dokładnie dwoma plikami: plikiem wideo, po którym następuje plik audio.

## Parameters {#parameters}

To narzędzie nie ma parametrów ustawień. Prześlij plik wideo i plik audio jako dwie części `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Muszą zostać przesłane dokładnie dwa pliki: pierwszy musi być wideo, drugi musi być plikiem audio.
- Jeśli plik audio jest dłuższy niż wideo, jest przycinany do czasu trwania wideo. Jeśli krótszy, pozostała część wideo odtwarzana jest w ciszy.
- Strumień wideo jest kopiowany bez ponownego kodowania, więc nie ma utraty jakości wideo.
