---
description: "Konwertuje między JSON a XML w obu kierunkach."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: c2acfb37cdf4
---

# JSON to XML {#json-to-xml}

Konwertuje między formatami JSON a XML w obu kierunkach. Prześlij plik JSON, aby otrzymać XML, albo prześlij plik XML, aby otrzymać JSON.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Przyjmuje dane formularza multipart z plikiem JSON lub XML oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Nie | `true` | Formatuje wynik z wcięciami dla czytelności |

## Example Request {#example-request}

JSON na XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML na JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- Kierunek konwersji jest automatycznie wykrywany na podstawie rozszerzenia pliku wejściowego: `.json` tworzy `.xml`, a `.xml` tworzy `.json`.
- Parametr `pretty` ma zastosowanie w obu kierunkach. Gdy `false`, wynik jest zwarty i bez wcięć.
- Atrybuty XML i struktury zagnieżdżone są w miarę możliwości zachowywane podczas konwersji w obie strony.
