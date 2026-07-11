---
description: "Przekształć plik PDF na archiwalny format PDF/A-2 do długoterminowego przechowywania."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 05ef368e1850
---

# PDF/A Convert {#pdf-a-convert}

Przekształć plik PDF na archiwalny format PDF/A-2, odpowiedni do długoterminowego przechowywania i zgodności z przepisami.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Przyjmuje dane formularza multipart z plikiem PDF. Pole `settings` nie jest wymagane.

## Parameters {#parameters}

To narzędzie nie ma parametrów ustawień. Prześlij plik PDF bezpośrednio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- Wynik jest zgodny ze standardem PDF/A-2.
- PDF/A osadza wszystkie czcionki i nie dopuszcza odwołań zewnętrznych, więc plik wynikowy może być większy od oryginału.
- Szyfrowanie i JavaScript są usuwane podczas konwersji, ponieważ nie są dozwolone przez standard PDF/A.
