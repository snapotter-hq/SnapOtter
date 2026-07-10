---
description: "Extrahera filer säkert ur ett ZIP-arkiv med bombskydd."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: cc8adb7b9743
---

# Extract ZIP {#extract-zip}

Extrahera filer säkert ur ett ZIP-arkiv. Arkiv med en enda fil returnerar den innehållna filen direkt; arkiv med flera filer returnerar en platt ZIP med det extraherade innehållet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Tar emot multipart-formulärdata med en ZIP-fil. Inget inställningsfält krävs.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp en `.zip`-fil att extrahera.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- Endast `.zip`-filer godtas som indata.
- Om arkivet innehåller en enda fil returneras den filen direkt (inte inpackad i en ZIP).
- Om arkivet innehåller flera filer returneras en platt ZIP med alla filer extraherade till rotnivån (den kapslade katalogstrukturen plattas ut).
- Inbyggt bombskydd avvisar arkiv med orimliga komprimeringsförhållanden eller filantal för att förhindra resursutmattning.
