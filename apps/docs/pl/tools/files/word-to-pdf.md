---
description: "Konwertuj dokumenty Word na PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 8a33d52287c9
---

# Word na PDF {#word-to-pdf}

Konwertuj dokumenty Word, tekst OpenDocument, RTF lub pliki zwykłego tekstu na PDF.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Przyjmuje dane formularza multipart z plikiem Word/ODT/RTF/TXT.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij dokument, a zostanie on przekonwertowany na PDF.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Akceptowane formaty wejściowe: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Konwersję obsługuje LibreOffice działający w trybie headless na serwerze.
- Czcionki osadzone w dokumencie są używane, gdy są dostępne; w przeciwnym razie zastępowane są czcionkami systemowymi.
- Nagłówki, stopki, tabele i obrazy są zachowywane w wynikowym PDF.
