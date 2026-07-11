---
description: "Wyodrębnienie klatek z wideo jako archiwum ZIP obrazów."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 54b7da47b8a4
---

# Video to Frames {#video-to-frames}

Wyodrębnia pojedyncze klatki z wideo i pobiera je jako archiwum ZIP obrazów PNG lub JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| mode | string | Nie | `"all"` | Tryb wyodrębniania: `all`, `nth`, `timestamps` |
| n | integer | Nie | `10` | Wyodrębnianie co N-tej klatki (2-1000). Używane tylko, gdy tryb to `"nth"` |
| timestamps | string | Nie | `""` | Znaczniki czasu oddzielone przecinkami w sekundach. Wymagane, gdy tryb to `"timestamps"` |
| format | string | Nie | `"png"` | Format obrazu dla wyodrębnionych klatek: `png`, `jpg` |

## Example Request {#example-request}

Wyodrębnij co 30. klatkę jako JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Wyodrębnij klatki w określonych znacznikach czasu:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- Tryb `all` wyodrębnia każdą klatkę i może tworzyć bardzo duże pliki ZIP dla długich filmów. Użyj trybu `nth` lub `timestamps` do selektywnego wyodrębniania.
- PNG zachowuje pełną jakość, ale tworzy większe pliki. JPG jest mniejszy, ale stratny.
- Odpowiedź pobiera się jako archiwum ZIP zawierające kolejno numerowane pliki obrazów.
