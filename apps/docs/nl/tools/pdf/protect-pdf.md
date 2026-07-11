---
description: "Voeg wachtwoordbeveiliging met AES-256-versleuteling toe aan een PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 6143236a87da
---

# Protect PDF {#protect-pdf}

Voeg wachtwoordbeveiliging toe aan een PDF met AES-256-versleuteling.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| userPassword | string | Ja | - | Wachtwoord dat vereist is om de PDF te openen (1-256 tekens) |
| ownerPassword | string | Nee | Hetzelfde als `userPassword` | Eigenaarswachtwoord voor rechten (1-256 tekens) |

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

- Versleuteling gebruikt AES-256.
- Als `ownerPassword` wordt weggelaten, krijgt het standaard dezelfde waarde als `userPassword`.
- Wachtwoorden worden geredigeerd uit auditlogs.
- De versleutelde PDF vereist het gebruikerswachtwoord om te openen en het eigenaarswachtwoord (indien verschillend) voor volledige rechten.
