---
description: "Konwertuj prezentacje na PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 9e801b2335f8
---

# PowerPoint na PDF {#powerpoint-to-pdf}

Konwertuj prezentacje PowerPoint lub OpenDocument na PDF, jeden slajd na stronę.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Przyjmuje dane formularza multipart z plikiem PowerPoint/ODP.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij prezentację, a zostanie ona przekonwertowana na PDF.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Przykładowa odpowiedź {#example-response}

Zwraca `202 Accepted`. Śledź postęp przez SSE pod `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Uwagi {#notes}

- Akceptowane formaty wejściowe: `.pptx`, `.ppt`, `.odp`.
- Każdy slajd staje się jedną stroną w PDF.
- Konwersję obsługuje LibreOffice działający w trybie headless na serwerze.
- Animacje i przejścia nie są uwzględniane w wynikowym PDF.
