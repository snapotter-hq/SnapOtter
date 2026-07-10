---
description: "Odczytuj i zapisuj metadane dokumentu PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 3b8fa377ae31
---

# PDF Metadata {#pdf-metadata}

Odczytuj i aktualizuj pola metadanych dokumentu PDF, takie jak tytuł, autor, temat i słowa kluczowe. Gdy nie podano żadnych ustawień, istniejące metadane są zwracane bez zmian.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Przyjmuje dane formularza multipart z plikiem PDF oraz opcjonalnym polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Tytuł dokumentu (maks. 500 znaków) |
| author | string | No | - | Autor dokumentu (maks. 500 znaków) |
| subject | string | No | - | Temat dokumentu (maks. 500 znaków) |
| keywords | string | No | - | Słowa kluczowe dokumentu (maks. 500 znaków) |

Wszystkie parametry są opcjonalne. Pominięte pola pozostają bez zmian.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Akceptowany format wejściowy: `.pdf`.
- To szybkie (synchroniczne) narzędzie, które zwraca wynik bezpośrednio.
- Pole `metadata` w odpowiedzi zawiera wynikowe metadane po wszystkich aktualizacjach.
- Aby odczytać metadane bez ich modyfikowania, pomiń pole `settings` lub wyślij pusty obiekt.
- Każde pole metadanych jest ograniczone do 500 znaków.
