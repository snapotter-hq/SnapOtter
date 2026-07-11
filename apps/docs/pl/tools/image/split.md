---
description: "Podziel jeden obraz na kafelki siatki według wierszy i kolumn lub według rozmiaru w pikselach, zwracane jako archiwum ZIP."
i18n_source_hash: 57a2e11e7cce
i18n_provenance: human
i18n_output_hash: fe0c6f88ea40
---

# Dzielenie obrazu {#image-splitting}

Podziel pojedynczy obraz na kafelki siatki według liczby kolumn/wierszy lub według konkretnych wymiarów w pikselach. Zwraca archiwum ZIP zawierające wszystkie kafelki.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| columns | integer | Nie | 3 | Liczba kolumn do podziału (1 do 100) |
| rows | integer | Nie | 3 | Liczba wierszy do podziału (1 do 100) |
| tileWidth | integer | Nie | - | Szerokość kafelka w pikselach (min 10). Zastępuje `columns`, gdy ustawione są jednocześnie `tileWidth` i `tileHeight`. |
| tileHeight | integer | Nie | - | Wysokość kafelka w pikselach (min 10). Zastępuje `rows`, gdy ustawione są jednocześnie `tileWidth` i `tileHeight`. |
| outputFormat | string | Nie | `"original"` | Format wyjściowy kafelków: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Nie | 90 | Jakość wyjściowa dla formatów stratnych (1 do 100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Przykładowa odpowiedź {#example-response}

Odpowiedź jest przesyłana strumieniowo bezpośrednio jako plik ZIP z `Content-Type: application/zip`. Nazwa pliku ma format `split-<jobId>.zip`.

Każdy kafelek wewnątrz ZIP jest nazwany `<originalBaseName>_r<row>_c<col>.<ext>` (np. `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Uwagi {#notes}

- Przyjmuje pojedynczy plik obrazu.
- Obsługuje formaty wejściowe HEIC, RAW, PSD i SVG (automatycznie dekodowane).
- Gdy podane są jednocześnie `tileWidth` i `tileHeight`, mają one priorytet nad `columns`/`rows`. Wymiary siatki są obliczane jako `ceil(imageWidth / tileWidth)` i `ceil(imageHeight / tileHeight)`.
- Kafelki brzegowe (najbardziej wysunięta w prawo kolumna, dolny wiersz) mogą być mniejsze niż określony rozmiar kafelka, jeśli wymiary obrazu nie dzielą się równo.
- Maksymalny rozmiar siatki jest ograniczony do 100x100 (10 000 kafelków).
- Odpowiedź przesyła ZIP strumieniowo bezpośrednio, więc nie ma treści odpowiedzi JSON. Użyj `--output` z curl, aby zapisać plik.
