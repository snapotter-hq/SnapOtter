---
description: "Wyodrębnij zwykły tekst z pliku PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 2b5129d77eaa
---

# PDF to Text {#pdf-to-text}

Wyodrębnij cały czytelny zwykły tekst z dokumentu PDF do pliku tekstowego.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Przyjmuje dane formularza multipart z plikiem PDF.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik PDF, a jego treść tekstowa zostanie wyodrębniona.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Akceptowany format wejściowy: `.pdf`.
- To szybkie (synchroniczne) narzędzie, które zwraca wynik bezpośrednio.
- Pole `chars` w odpowiedzi wskazuje liczbę wyodrębnionych znaków.
- Wyodrębniany jest tylko cyfrowo osadzony tekst. W przypadku zeskanowanych dokumentów lub plików PDF opartych na obrazach użyj narzędzia [PDF OCR](./ocr-pdf).
