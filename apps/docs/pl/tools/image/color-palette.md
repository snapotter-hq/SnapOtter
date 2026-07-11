---
description: "Wyodrębnij dominujące kolory z obrazu jako paletę barw."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 59ef3b7b2f37
---

# Paleta kolorów {#color-palette}

Wyodrębnij dominujące kolory z obrazu i zwróć je jako wartości szesnastkowe. Wykorzystuje skwantowaną analizę częstości, aby zidentyfikować najbardziej wyróżniające się i wizualnie odmienne kolory.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Przyjmuje dane formularza multipart z plikiem obrazu oraz opcjonalnym polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| count | integer | Nie | `8` | Liczba kolorów do wyodrębnienia (2-16) |
| format | string | Nie | `"hex"` | Format koloru: `hex`, `rgb`, `hsl` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Pola odpowiedzi {#response-fields}

| Pole | Typ | Opis |
|-------|------|-------------|
| filename | string | Oczyszczona nazwa pliku |
| colors | array | Tablica ciągów kolorów w żądanym formacie, uporządkowana według dominacji (najczęstsze jako pierwsze) |
| hex | array | Tablica szesnastkowych ciągów kolorów (zawsze szesnastkowa, niezależnie od ustawienia `format`) |
| count | number | Liczba wyodrębnionych kolorów |

## Uwagi {#notes}

- Zwraca do `count` dominujących kolorów (domyślnie 8, zakres 2-16), posortowanych według częstości (najczęstsze jako pierwsze).
- Obraz jest wewnętrznie skalowany do 100x100 pikseli na potrzeby analizy, więc paleta odzwierciedla ogólny rozkład kolorów, a nie drobne szczegóły.
- Kolory są wyodrębniane metodą kwantyzacji median-cut, która rekurencyjnie dzieli populacje pikseli wzdłuż kanału o najszerszym zakresie.
- Kanał alfa jest usuwany przed analizą, więc obszary przezroczyste nie są uwzględniane.
- To punkt końcowy tylko do odczytu. Nie generuje pliku wyjściowego do pobrania ani `jobId`.
- Pliki wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed analizą.
