---
description: "Połącz wiele plików CSV lub TSV o pasujących kolumnach w jeden."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 6784e9ab2390
---

# Scal pliki CSV {#merge-csvs}

Połącz wiele plików CSV lub TSV o pasujących kolumnach w jeden scalony plik. Wszystkie pliki wejściowe muszą mieć te same nagłówki kolumn.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Przyjmuje dane formularza multipart z dwoma lub więcej plikami CSV. Pole ustawień nie jest wymagane.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij od 2 do 20 plików CSV lub TSV o pasujących nagłówkach kolumn.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Uwagi {#notes}

- Wymaga od 2 do 20 plików wejściowych.
- Wszystkie pliki muszą mieć te same nagłówki kolumn. Scalanie nie powiedzie się, jeśli kolumny nie będą się zgadzać.
- Wiersz nagłówka jest dołączany raz do wyniku; wiersze danych ze wszystkich plików są łączone w kolejności przesyłania.
- Akceptowane są zarówno pliki CSV, jak i TSV, ale wszystkie pliki w jednym żądaniu powinny używać tego samego separatora.
