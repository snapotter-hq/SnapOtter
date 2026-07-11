---
description: "Wyodrębnienie ścieżki napisów z wideo jako pliku SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: ac147ac94c4d
---

# Extract Subtitles {#extract-subtitles}

Wyodrębnia osadzoną ścieżkę napisów z kontenera wideo i pobiera ją jako plik SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Przyjmuje dane formularza multipart z plikiem wideo. To narzędzie nie ma konfigurowalnych ustawień.

## Parameters {#parameters}

To narzędzie nie ma parametrów. Wyodrębnia pierwszą ścieżkę napisów znalezioną w kontenerze wideo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Wideo musi zawierać osadzoną ścieżkę napisów. Jeśli nie znaleziono ścieżki napisów, żądanie zwraca błąd 400.
- Jeśli wideo ma wiele ścieżek napisów, wyodrębniana jest pierwsza z nich.
- Format wyjściowy to SRT, niezależnie od oryginalnego formatu napisów w kontenerze.
