---
description: "Lägg till lösenordsskydd med AES-256-kryptering på en PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 834ae32be7e4
---

# Protect PDF {#protect-pdf}

Lägg till lösenordsskydd på en PDF med AES-256-kryptering.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| userPassword | string | Ja | - | Lösenord som krävs för att öppna PDF-filen (1-256 tecken) |
| ownerPassword | string | Nej | Samma som `userPassword` | Ägarlösenord för behörigheter (1-256 tecken) |

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

- Krypteringen använder AES-256.
- Om `ownerPassword` utelämnas får det som standard samma värde som `userPassword`.
- Lösenord redigeras bort från granskningsloggar.
- Den krypterade PDF-filen kräver användarlösenordet för att öppnas och ägarlösenordet (om det skiljer sig) för fulla behörigheter.
