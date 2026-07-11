---
description: "Nałóż logo lub obraz jako znak wodny z konfigurowalną pozycją, nieprzezroczystością i skalą."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: e20ea49a024c
---

# Znak wodny z obrazu {#image-watermark}

Nałóż logo lub dodatkowy obraz jako znak wodny na obraz bazowy. Znak wodny jest skalowany względem szerokości obrazu bazowego i umieszczany w narożniku lub na środku.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Przyjmuje dane formularza multipart z **dwoma** plikami obrazów i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| position | string | Nie | `"bottom-right"` | Umieszczenie znaku wodnego: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | Nie | `50` | Procent nieprzezroczystości znaku wodnego (0 do 100) |
| scale | number | Nie | `25` | Szerokość znaku wodnego jako procent szerokości głównego obrazu (1 do 100) |

### Pola plików {#file-fields}

| Nazwa pola | Wymagany | Opis |
|------------|----------|-------------|
| file | Tak | Główny/bazowy obraz |
| watermark | Tak | Obraz znaku wodnego/logo |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Uwagi {#notes}

- Oba obrazy są walidowane i dekodowane (obsługiwane HEIC, RAW, PSD, SVG).
- Znak wodny jest skalowany proporcjonalnie tak, aby jego szerokość równała się `scale`% szerokości głównego obrazu.
- Nieprzezroczystość jest stosowana przez maskę alfa złożoną z mieszaniem `dest-in`.
- Pozycje narożne stosują margines 20px od krawędzi obrazu.
- Jeśli obraz znaku wodnego ma przezroczystość (np. logo PNG), jest ona zachowywana podczas komponowania.
- Orientacja EXIF jest automatycznie stosowana do obu obrazów przed przetwarzaniem.
