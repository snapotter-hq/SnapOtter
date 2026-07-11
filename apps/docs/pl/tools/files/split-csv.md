---
description: "Podziel plik CSV na mniejsze pliki według liczby wierszy."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: ed96175fdcc4
---

# Podziel CSV {#split-csv}

Podziel duży plik CSV lub TSV na mniejsze pliki według liczby wierszy. Zwraca archiwum ZIP zawierające części.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Przyjmuje dane formularza multipart z plikiem CSV oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | Nie | `1000` | Liczba wierszy danych na plik wynikowy (1-1 000 000) |
| keepHeader | boolean | Nie | `true` | Powtórz wiersz nagłówka w każdym pliku wynikowym |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Uwagi {#notes}

- Wynik jest zawsze archiwum ZIP zawierającym podzielone części CSV, nazwane kolejno (np. `part-1.csv`, `part-2.csv`).
- Gdy `keepHeader` ma wartość `true`, każda część zawiera oryginalny wiersz nagłówka, dzięki czemu każdy plik może być używany niezależnie.
- Jako dane wejściowe akceptowane są zarówno pliki CSV, jak i TSV.
- Liczba wierszy odnosi się wyłącznie do wierszy danych; wiersz nagłówka nie jest liczony.
