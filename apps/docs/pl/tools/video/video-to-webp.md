---
description: "Konwersja klipu wideo na animowany obraz WebP."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: a2a9bf0ed9d4
---

# Video to WebP {#video-to-webp}

Konwertuje klip wideo na animowany obraz WebP z konfigurowalną liczbą klatek na sekundę, szerokością i jakością.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| fps | integer | Nie | `12` | Wyjściowa liczba klatek na sekundę (1-30) |
| width | integer | Nie | `480` | Szerokość wyjściowa w pikselach (16-1920). Wysokość skaluje się proporcjonalnie |
| quality | integer | Nie | `75` | Jakość kompresji WebP (1-100) |
| loop | boolean | Nie | `true` | Zapętlenie animacji |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Animowany WebP tworzy mniejsze pliki niż GIF z lepszą obsługą kolorów (paleta 24-bitowa vs 8-bitowa).
- Niższe wartości `quality` tworzą mniejsze pliki kosztem wierności wizualnej.
- Ustaw `loop` na `false` dla animacji, które powinny odtworzyć się raz i zatrzymać.
