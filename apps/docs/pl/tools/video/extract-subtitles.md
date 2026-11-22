---
description: "Wyodrębnia ścieżkę napisów z wideo jako plik SRT, WebVTT lub ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: fb36f0675acd
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Wyodrębnia osadzoną ścieżkę napisów z kontenera wideo i pobiera ją jako plik SRT, WebVTT lub ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Przyjmuje dane formularza multipart z plikiem wideo i opcjonalnym ciągiem JSON `settings`.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Format wyjściowy: `srt`, `vtt` (WebVTT) lub `ass` |

Wyodrębniana jest pierwsza ścieżka napisów znaleziona w kontenerze wideo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Wideo musi zawierać osadzoną ścieżkę napisów. Jeśli nie znaleziono ścieżki napisów, żądanie zwraca błąd 400.
- Jeśli wideo ma wiele ścieżek napisów, wyodrębniana jest pierwsza z nich.
- Ścieżki tekstowe (SubRip, ASS, mov_text, WebVTT) można przekonwertować na dowolny z trzech formatów wyjściowych. Konwersja ścieżki ASS do SRT lub WebVTT usuwa jej pozycjonowanie i efekty.
- Ścieżek opartych na obrazach (Blu-ray PGS, DVD VobSub) nie da się zamienić na tekst bez OCR, dlatego zwracają błąd 422.
