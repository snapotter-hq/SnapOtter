---
description: "Konwertuje między formatami Word, OpenDocument, RTF i zwykłego tekstu."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: ca05a71bfc27
---

# Convert Document {#convert-document}

Konwertuje dokumenty między formatami Word (DOCX), OpenDocument (ODT), RTF i zwykłego tekstu przy użyciu LibreOffice.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Przyjmuje dane formularza multipart z plikiem Word/ODT/RTF/TXT oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Tak | - | Format wyjściowy: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
```

## Example Response {#example-response}

Zwraca `202 Accepted`. Śledź postęp przez SSE pod `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akceptowane formaty wejściowe: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Konwersję obsługuje LibreOffice działający w trybie headless na serwerze.
- Złożone formatowanie (makra, obiekty osadzone) może nie przetrwać konwersji między formatami.
- Format wyjściowy musi różnić się od formatu wejściowego.
