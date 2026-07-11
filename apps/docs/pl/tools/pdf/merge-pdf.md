---
description: "Połącz wiele plików PDF w jeden dokument."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: 59a64d47903b
---

# Merge PDFs {#merge-pdfs}

Połącz dwa lub więcej plików PDF w jeden dokument, zachowując kolejność stron każdego pliku wejściowego.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Przyjmuje dane formularza multipart z dwoma lub więcej plikami PDF. Pole `settings` nie jest wymagane.

## Parameters {#parameters}

To narzędzie nie ma parametrów ustawień. Wystarczy przesłać dwa lub więcej plików PDF.

| Constraint | Value |
|------------|-------|
| Minimum files | 2 |
| Maximum files | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Pliki są łączone w kolejności, w jakiej zostały przesłane.
- Wymagane są co najmniej dwa pliki PDF; żądanie zakończy się błędem 400, jeśli podano mniej.
- Maksymalna liczba plików wejściowych to 20.
- Zaszyfrowane pliki PDF muszą zostać odblokowane przed połączeniem.
