---
description: "Wtapianie tekstowego znaku wodnego na klatki wideo."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 7bf27232d5ed
---

# Watermark Video {#watermark-video}

Wtapia tekstowy znak wodny na każdą klatkę wideo z konfigurowalnym położeniem, rozmiarem, przezroczystością i kolorem.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| text | string | Tak | - | Tekst znaku wodnego (1-200 znaków) |
| position | string | Nie | `"br"` | Położenie na klatce: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Nie | `36` | Rozmiar czcionki w pikselach (8-120) |
| opacity | number | Nie | `0.5` | Przezroczystość znaku wodnego (0.05-1) |
| color | string | Nie | `"#ffffff"` | Kolor tekstu w formacie hex (np. `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Lewy górny, **tc** - Górny środek, **tr** - Prawy górny
- **l** - Środkowy lewy, **c** - Środek, **r** - Środkowy prawy
- **bl** - Lewy dolny, **bc** - Dolny środek, **br** - Prawy dolny

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Znak wodny jest trwale renderowany w klatki wideo i nie można go usunąć po przetworzeniu.
- Znak wodny używa czcionki bezszeryfowej wbudowanej w FFmpeg.
- W przypadku znaków wodnych opartych na obrazie użyj zamiast tego narzędzia Watermark dla obrazów.
