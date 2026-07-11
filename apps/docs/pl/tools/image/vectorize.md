---
description: "Konwertuj obrazy rastrowe do SVG z wektoryzacją czarno-białą (potrace) oraz pełnokolorową, wielowarstwową."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 9ebb92e9d5f9
---

# Obraz do SVG {#image-to-svg}

Wektoryzuj obrazy rastrowe do SVG przy użyciu algorytmów śledzenia. Obsługuje śledzenie czarno-białe (potrace) oraz pełnokolorową wektoryzację wielowarstwową.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| colorMode | string | Nie | `"bw"` | Tryb śledzenia: `bw` (czarno-biały) lub `color` (wielokolorowe warstwy) |
| threshold | number | Nie | 128 | Próg jasności dla trybu czarno-białego (0 do 255). Piksele poniżej stają się czarne. |
| colorPrecision | number | Nie | 6 | Precyzja kwantyzacji kolorów dla trybu kolorowego (1 do 16). Wyższe wartości dają więcej odrębnych warstw kolorów. |
| layerDifference | number | Nie | 6 | Minimalna różnica kolorów między warstwami w trybie kolorowym (1 do 128) |
| filterSpeckle | number | Nie | 4 | Minimalna powierzchnia śledzonych kształtów w pikselach (1 do 256). Usuwa szum/plamki. |
| pathMode | string | Nie | `"spline"` | Wygładzanie ścieżek: `none` (postrzępione), `polygon` (proste odcinki), `spline` (gładkie krzywe) |
| cornerThreshold | number | Nie | 60 | Próg kąta dla wykrywania narożników w trybie kolorowym (0 do 180 stopni) |
| invert | boolean | Nie | `false` | Odwróć obraz przed śledzeniem (zamień czarny/biały) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Wektoryzacja kolorowa {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Uwagi {#notes}

- Wynikiem jest zawsze plik SVG, niezależnie od formatu wejściowego.
- Obsługuje formaty wejściowe HEIC, RAW, PSD i SVG (automatycznie dekodowane do rastra przed śledzeniem).
- Tryb czarno-biały używa algorytmu potrace. Obraz jest najpierw konwertowany na skalę szarości, a następnie progowany do czystej czerni/bieli przed śledzeniem.
- Tryb kolorowy stosuje podejście wielowarstwowe: obraz jest kwantyzowany na warstwy kolorów, z których każda jest śledzona osobno i układana w wyniku SVG.
- Niższe wartości `filterSpeckle` zachowują więcej detali, ale dają większe pliki SVG z większą liczbą ścieżek.
- Ustawienie `pathMode` znacząco wpływa na rozmiar pliku: `none` daje najwięcej ścieżek, `spline` daje najgładszy (i zwykle najmniejszy) wynik.
- Dla najlepszych rezultatów z logo i ikonami użyj trybu czarno-białego z czystym, wysokokontrastowym wejściem. Dla zdjęć lub ilustracji użyj trybu kolorowego z wyższym `colorPrecision`.
