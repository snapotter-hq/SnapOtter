---
description: "Wyodrębnienie ścieżki audio z wideo."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: b10868e50d7c
---

# Extract Audio {#extract-audio}

Wyodrębnia ścieżkę audio z pliku wideo i zapisuje ją jako MP3, WAV, M4A lub OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Nie | `"mp3"` | Wyjściowy format audio: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Jeśli wideo nie ma ścieżki audio, żądanie zwraca błąd 400.
- MP3 jest stratny, ale szeroko kompatybilny. WAV jest bezstratny, ale duży. M4A (AAC) oferuje dobrą równowagę między jakością a rozmiarem. OGG jest dostępny dla przepływów pracy z otwartymi kodekami.
- Gdy źródłowe audio jest już w AAC, a format wyjściowy to M4A, strumień audio jest kopiowany bez ponownego kodowania.
