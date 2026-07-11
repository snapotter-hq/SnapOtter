---
description: "Konwertuje między CSV a Excel (XLSX) w obu kierunkach."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 4daab9e32ab9
---

# CSV to Excel {#csv-to-excel}

Konwertuje między formatami CSV a Excel (XLSX) w obu kierunkach. Prześlij plik CSV lub TSV, aby otrzymać XLSX, albo prześlij plik XLSX, aby otrzymać CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Przyjmuje dane formularza multipart z plikiem CSV, TSV lub XLSX oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| sheet | integer | Nie | `1` | Numer arkusza do wyeksportowania podczas konwersji z XLSX (min. 1) |

## Example Request {#example-request}

CSV na Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel na CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- Kierunek konwersji jest automatycznie wykrywany na podstawie rozszerzenia pliku wejściowego: `.csv` lub `.tsv` tworzy `.xlsx`, a `.xlsx` tworzy `.csv`.
- Parametr `sheet` ma zastosowanie tylko podczas konwersji z XLSX. Wybiera arkusz do wyeksportowania.
- Pliki TSV (wartości rozdzielane tabulatorami) są obsługiwane obok CSV.
