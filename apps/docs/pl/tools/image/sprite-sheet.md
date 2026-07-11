---
description: "Połącz wiele obrazów w jedną siatkę arkusza sprite'ów z metadanymi klatek."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 20696c236b46
---

# Arkusz sprite'ów {#sprite-sheet}

Połącz wiele obrazów w jedną siatkę arkusza sprite'ów. Każdy obraz jest skalowany, aby dopasować się do wymiarów pierwszego obrazu, i umieszczany w siatce. Zwraca obraz arkusza sprite'ów wraz z metadanymi współrzędnych dla każdej klatki.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Przyjmuje dane formularza multipart z dwoma lub więcej plikami obrazów i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| columns | integer | Nie | `4` | Liczba kolumn w siatce (1-16) |
| padding | integer | Nie | `0` | Odstęp między komórkami w pikselach (0-64) |
| background | string | Nie | `"#ffffff"` | Kolor tła w formacie hex |
| format | string | Nie | `"png"` | Format wyjściowy: `png`, `webp` lub `jpeg` |
| quality | integer | Nie | `90` | Jakość wyjściowa (1-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Uwagi {#notes}

- Przyjmuje od 2 do 64 obrazów. Wszystkie obrazy są skalowane, aby dopasować się do wymiarów pierwszego przesłanego obrazu.
- Tablica `frames` podaje dokładne współrzędne pikselowe każdej klatki w wyniku, odpowiednie do definicji sprite'ów CSS lub map klatek silników gier.
- Liczba wierszy jest obliczana automatycznie na podstawie liczby obrazów i wartości `columns`.
- Użyj parametru `padding`, aby dodać odstęp między komórkami. Kolor `background` jest widoczny w obszarach odstępów oraz we wszelkich pustych końcowych komórkach.
- Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
