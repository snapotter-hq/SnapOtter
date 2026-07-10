---
description: "Dodaj ochronę hasłem z szyfrowaniem AES-256 do pliku PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 284a38fb7722
---

# Protect PDF {#protect-pdf}

Dodaj ochronę hasłem do pliku PDF przy użyciu szyfrowania AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | Hasło wymagane do otwarcia pliku PDF (1-256 znaków) |
| ownerPassword | string | No | Takie samo jak `userPassword` | Hasło właściciela do uprawnień (1-256 znaków) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Szyfrowanie używa AES-256.
- Jeśli pominięto `ownerPassword`, przyjmuje domyślnie tę samą wartość co `userPassword`.
- Hasła są usuwane z dzienników audytu.
- Zaszyfrowany plik PDF wymaga hasła użytkownika do otwarcia oraz hasła właściciela (jeśli jest inne) do pełnych uprawnień.
