---
description: "Konwertuje między CSV a JSON w obu kierunkach."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 26c25e28620d
---

# CSV to JSON {#csv-to-json}

Konwertuje między formatami CSV a JSON w obu kierunkach. Prześlij plik CSV lub TSV, aby otrzymać tablicę obiektów JSON, albo prześlij tablicę JSON, aby otrzymać plik CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Przyjmuje dane formularza multipart z plikiem CSV, TSV lub JSON oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Nie | `true` | Formatuje wynik JSON z wcięciami dla czytelności |

## Example Request {#example-request}

CSV na JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON na CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- Kierunek konwersji jest automatycznie wykrywany na podstawie rozszerzenia pliku wejściowego: `.csv` lub `.tsv` tworzy `.json`, a `.json` tworzy `.csv`.
- Parametr `pretty` wpływa tylko na wynik JSON. Ustawiony na `false` powoduje, że wynikiem jest zwarty jednowierszowy ciąg JSON.
- Wejście JSON musi być tablicą obiektów o spójnych kluczach. Każdy obiekt staje się wierszem, a każdy klucz nagłówkiem kolumny.
- Pliki TSV (wartości rozdzielane tabulatorami) są obsługiwane obok CSV.
