---
description: "Skalowanie wideo do nowej rozdzielczości lub predefiniowanego rozmiaru."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: c1b9109b0f82
---

# Resize Video {#resize-video}

Skaluje wideo do nowej rozdzielczości przy użyciu niestandardowych wymiarów w pikselach lub standardowego ustawienia wstępnego.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| width | integer | Nie | - | Docelowa szerokość w pikselach (16-7680) |
| height | integer | Nie | - | Docelowa wysokość w pikselach (16-4320) |
| preset | string | Nie | `"custom"` | Ustawienie wstępne rozdzielczości: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Gdy `preset` ma wartość `"custom"`, należy podać co najmniej jeden z parametrów `width` lub `height`. Drugi wymiar skaluje się proporcjonalnie.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Zmiana rozmiaru do niestandardowych wymiarów:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Wartości ustawień wstępnych odpowiadają standardowym wysokościom (np. `720p` = 1280x720, `1080p` = 1920x1080). Szerokość skaluje się proporcjonalnie na podstawie proporcji źródła.
- Wymiary są zaokrąglane do liczb parzystych, zgodnie z wymaganiami większości kodeków wideo.
- Maksymalna obsługiwana rozdzielczość to 7680x4320 (8K UHD).
