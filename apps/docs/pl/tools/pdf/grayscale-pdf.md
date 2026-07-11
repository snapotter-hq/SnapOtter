---
description: "Przekształć wszystkie kolory w pliku PDF na odcienie szarości."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: fcc28ef94a2f
---

# Grayscale PDF {#grayscale-pdf}

Przekształć wszystkie kolory w pliku PDF na odcienie szarości, tworząc czarno-białą wersję dokumentu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Przyjmuje dane formularza multipart z plikiem PDF. Pole `settings` nie jest wymagane.

## Parameters {#parameters}

To narzędzie nie ma parametrów ustawień. Prześlij plik PDF bezpośrednio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Wszystkie przestrzenie barw (RGB, CMYK) są konwertowane na odcienie szarości, w tym osadzone obrazy, grafika wektorowa i tekst.
- Plik wynikowy jest często mniejszy niż oryginał, ponieważ dane w skali szarości wymagają mniej bajtów na piksel.
