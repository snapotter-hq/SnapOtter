---
description: "Bunta ihop flera filer till ett enda ZIP-arkiv."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: b0e7ea4d0593
---

# Create ZIP {#create-zip}

Bunta ihop flera filer av valfri typ till ett enda ZIP-arkiv. Dubbletter av filnamn dedupliceras automatiskt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Tar emot multipart-formulärdata med två eller flera filer. Inget inställningsfält krävs.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp 2-50 filer av valfri typ att bunta ihop.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Kräver mellan 2 och 50 indatafiler.
- Alla filtyper godtas; det finns inga begränsningar för indataformat.
- Om flera filer delar samma namn dedupliceras de automatiskt med numeriska suffix.
- Utdataarkivet använder ZIP-standardkomprimering (deflate).
