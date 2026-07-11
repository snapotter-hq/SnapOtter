---
description: "Spróbuj naprawić uszkodzony lub zniszczony plik PDF."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: ad4bb1033364
---

# Repair PDF {#repair-pdf}

Spróbuj naprawić uszkodzony lub zniszczony plik PDF, rekonstruując jego wewnętrzną strukturę.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Przyjmuje dane formularza multipart z plikiem PDF. Pole `settings` nie jest wymagane.

## Parameters {#parameters}

To narzędzie nie ma parametrów ustawień. Prześlij uszkodzony plik PDF bezpośrednio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Walidacja strukturalna na wejściu jest pomijana, aby przepuścić uszkodzone pliki.
- Naprawa działa na zasadzie najlepszego wysiłku; poważnie uszkodzone pliki mogą nie zostać w pełni odzyskane.
- Naprawiony plik PDF może nieznacznie różnić się rozmiarem od oryginału z powodu zrekonstruowanych tabel odwołań krzyżowych.
