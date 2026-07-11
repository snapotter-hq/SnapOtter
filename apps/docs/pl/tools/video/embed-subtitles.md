---
description: "Dołączenie ścieżki napisów do kontenera wideo."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 0e82ac2fb34e
---

# Embed Subtitles {#embed-subtitles}

Dołącza plik napisów do kontenera wideo jako miękką ścieżkę napisów, którą widzowie mogą włączać i wyłączać.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Przyjmuje dane formularza multipart z plikiem wideo i plikiem napisów oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| language | string | Nie | `"eng"` | Kod języka ISO 639-2/B (3 małe litery, np. `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- Prześlij dwa pliki: pierwszy musi być wideo, drugi musi być plikiem napisów (.srt, .vtt lub .ass).
- Osadzone (miękkie) napisy mogą być przełączane przez widza w jego odtwarzaczu multimediów. Aby uzyskać trwale widoczne napisy, użyj zamiast tego narzędzia Burn Subtitles.
- Kod języka jest przechowywany jako metadane w kontenerze i pomaga odtwarzaczom multimediów oznaczyć ścieżkę napisów.
