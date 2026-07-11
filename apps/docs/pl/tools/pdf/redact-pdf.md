---
description: "Trwale usuń wystąpienia tekstu z pliku PDF (zweryfikowana prawdziwa redakcja)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: fd42639315f7
---

# Redact PDF {#redact-pdf}

Trwale usuń określone wystąpienia tekstu z pliku PDF przy użyciu zweryfikowanej prawdziwej redakcji. Zredagowany tekst jest całkowicie usuwany z pliku, a nie tylko zakrywany czarnym prostokątem.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | Ciągi tekstowe do zredagowania (1-50 terminów, każdy do 200 znaków) |
| caseSensitive | boolean | No | `false` | Czy dopasowanie uwzględnia wielkość liter |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Akceptowany format wejściowy: `.pdf`.
- To szybkie (synchroniczne) narzędzie, które zwraca wynik bezpośrednio.
- Wykonuje prawdziwą redakcję: dopasowany tekst jest usuwany ze strumienia treści PDF, a nie jedynie wizualnie zasłaniany.
- Pole `found` w odpowiedzi wskazuje, ile wystąpień zostało zredagowanych.
- W jednym żądaniu można zredagować do 50 terminów.
