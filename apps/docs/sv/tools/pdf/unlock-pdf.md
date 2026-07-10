---
description: "Ta bort lösenordsskydd från en PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: d375099934ee
---

# Unlock PDF {#unlock-pdf}

Ta bort lösenordsskydd från en krypterad PDF genom att ange rätt lösenord.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| password | string | Ja | - | Lösenord för att dekryptera PDF-filen (1-256 tecken) |

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

- Rätt lösenord måste anges; ett felaktigt lösenord returnerar ett 400-fel.
- Antingen användarlösenordet eller ägarlösenordet fungerar för dekryptering.
- Lösenord redigeras bort från granskningsloggar.
