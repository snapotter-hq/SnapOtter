---
description: "Łącz obrazy obok siebie, jeden nad drugim lub w siatce, z kontrolą wyrównania, odstępów, obramowań i trybu skalowania."
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: 74ff73169fd0
---

# Połącz obrazy {#stitch-combine}

Łącz wiele obrazów obok siebie, ułożonych pionowo lub rozmieszczonych w siatce. Obsługuje wyrównanie, odstępy, obramowanie, zaokrąglenie narożników i wiele trybów skalowania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| direction | string | Nie | `"horizontal"` | Kierunek układu: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | Nie | 2 | Liczba kolumn, gdy kierunek to `grid` (2 do 100) |
| resizeMode | string | Nie | `"fit"` | Sposób skalowania obrazów: `fit`, `original`, `stretch`, `crop` |
| alignment | string | Nie | `"center"` | Wyrównanie w poprzek osi: `start`, `center`, `end` |
| gap | number | Nie | 0 | Odstęp między obrazami w pikselach (0 do 1000) |
| border | number | Nie | 0 | Szerokość zewnętrznego obramowania w pikselach (0 do 500) |
| cornerRadius | number | Nie | 0 | Zaokrąglenie narożników zastosowane do końcowego wyniku (0 do 500) |
| backgroundColor | string | Nie | `"#FFFFFF"` | Kolor tła/obramowania w formacie hex (np. `#FF0000`) |
| format | string | Nie | `"png"` | Format wyjściowy: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nie | 90 | Jakość wyjściowa (1 do 100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Uwagi {#notes}

- Wymaga co najmniej 2 obrazów. Prześlij wiele plików obrazów w żądaniu multipart.
- Obsługuje formaty wejściowe HEIC, RAW, PSD i SVG (automatycznie dekodowane).
- Tryby skalowania:
  - `fit` - Skaluje obrazy tak, aby dopasować się do najmniejszego wymiaru wzdłuż osi łączenia.
  - `original` - Zachowuje oryginalne rozmiary (może dawać nierówne krawędzie).
  - `stretch` - Wymusza dopasowanie obrazów do najmniejszego wymiaru bez zachowania proporcji.
  - `crop` - Kadruje obrazy metodą cover, aby dopasować się do najmniejszego wymiaru.
- W trybie `grid` komórki są skalowane do median wymiarów wszystkich obrazów.
- `cornerRadius` jest stosowane do całego końcowego wyniku, a nie do poszczególnych obrazów.
- Rozmiar płótna jest ograniczony konfiguracją serwera `MAX_CANVAS_PIXELS`, aby zapobiec wyczerpaniu pamięci.
