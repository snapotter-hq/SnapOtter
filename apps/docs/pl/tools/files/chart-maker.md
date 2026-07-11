---
description: "Tworzy wykresy słupkowe, liniowe lub kołowe z danych CSV lub JSON."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: 25849f2b1af2
---

# Chart Maker {#chart-maker}

Tworzy wykresy słupkowe, liniowe lub kołowe z danych CSV lub JSON. Zwraca obraz PNG z wyrenderowanym wykresem.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Przyjmuje dane formularza multipart z plikiem CSV lub JSON oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| kind | string | Nie | `"bar"` | Typ wykresu: `bar`, `line`, `pie` |
| title | string | Nie | - | Tytuł wykresu (maks. 120 znaków) |
| width | integer | Nie | `960` | Szerokość wykresu w pikselach (320-2048) |
| height | integer | Nie | `540` | Wysokość wykresu w pikselach (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- Wejściem musi być plik `.csv` lub `.json`. Pliki CSV powinny mieć wiersz nagłówka z nazwami kolumn.
- Pierwsza kolumna jest używana jako etykieta kategorii; druga kolumna musi być liczbowa i dostarcza wartości danych. Używane są tylko dwie kolumny.
- Wejście JSON powinno być tablicą obiektów `{label, value}` lub zwykłym obiektem, którego klucze stają się etykietami, a wartości punktami danych.
- Maksymalnie 100 punktów danych. Wszystkie wartości muszą być zerowe lub większe.
- Wynikiem jest zawsze obraz PNG, niezależnie od formatu wejściowego.
