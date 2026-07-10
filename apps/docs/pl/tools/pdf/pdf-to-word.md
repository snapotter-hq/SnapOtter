---
description: "Przekształć plik PDF na dokument Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 2ca20defe467
---

# PDF to Word {#pdf-to-word}

Przekształć plik PDF oparty na tekście na dokument Word (DOCX). Najlepiej sprawdza się przy plikach PDF z zaznaczalnym tekstem; zeskanowane strony będą najpierw wymagały OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Przyjmuje dane formularza multipart z plikiem PDF.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik PDF, a zostanie on przekształcony na DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
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

- Akceptowany format wejściowy: `.pdf`.
- Działa najlepiej z plikami PDF opartymi na tekście. Zeskanowane strony lub strony zawierające tylko obrazy dadzą pusty lub minimalny wynik; użyj [PDF OCR](./ocr-pdf), aby najpierw dodać warstwę tekstową.
- Konwersja jest obsługiwana przez LibreOffice działający w trybie headless na serwerze.
- Złożone układy (wielokolumnowe, nakładające się elementy) mogą nie zostać przekonwertowane idealnie.
