---
description: "Dodawaj tekstowe znaki wodne z konfigurowalną pozycją, nieprzezroczystością, obrotem i kafelkowaniem."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 94060d4844a7
---

# Tekstowy znak wodny {#text-watermark}

Dodaj nakładkę tekstowego znaku wodnego na obrazy. Obsługuje pojedyncze umieszczenie w narożnikach/na środku lub kafelkowe powtarzanie na całym obrazie, z konfigurowalnym rozmiarem czcionki, kolorem, nieprzezroczystością i obrotem.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| text | string | Tak | - | Tekst znaku wodnego (1 do 500 znaków) |
| fontSize | number | Nie | `48` | Rozmiar czcionki w pikselach (8 do 1000) |
| color | string | Nie | `"#000000"` | Kolor tekstu w formacie hex (`#RRGGBB`) |
| opacity | number | Nie | `50` | Procent nieprzezroczystości tekstu (0 do 100) |
| position | string | Nie | `"center"` | Umieszczenie: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Nie | `0` | Kąt obrotu tekstu w stopniach (-360 do 360) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Kafelkowy znak wodny na całym obrazie:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Uwagi {#notes}

- Znak wodny jest renderowany jako tekst SVG i komponowany na obrazie, zachowując jakość wyjściową.
- Tryb kafelkowy rozmieszcza elementy tekstu na podstawie rozmiaru czcionki (odstęp 6x w poziomie, 4x w pionie), z limitem maksymalnie 500 elementów.
- Dla pozycji narożnych margines od krawędzi równa się rozmiarowi czcionki.
- Używana czcionka to domyślna bezszeryfowa czcionka systemu.
- Znaki specjalne XML w tekście (`&`, `<`, `>`, `"`, `'`) są bezpiecznie escapowane.
- Format wyjściowy odpowiada formatowi wejściowemu. Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
