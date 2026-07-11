---
description: "Verwijder wachtwoordbeveiliging van een PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 9a9b8271d46b
---

# Unlock PDF {#unlock-pdf}

Verwijder wachtwoordbeveiliging van een versleutelde PDF door het juiste wachtwoord op te geven.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| password | string | Ja | - | Wachtwoord om de PDF te ontsleutelen (1-256 tekens) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Het juiste wachtwoord moet worden opgegeven; een onjuist wachtwoord geeft een 400-fout terug.
- Zowel het gebruikerswachtwoord als het eigenaarswachtwoord werkt voor ontsleuteling.
- Wachtwoorden worden geredigeerd uit auditlogs.
