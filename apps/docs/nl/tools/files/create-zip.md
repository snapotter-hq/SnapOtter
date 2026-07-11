---
description: "Bundel meerdere bestanden tot één ZIP-archief."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: f853f6db8cda
---

# Create ZIP {#create-zip}

Bundel meerdere bestanden van elk type tot één ZIP-archief. Dubbele bestandsnamen worden automatisch ontdubbeld.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Accepteert multipart-formulierdata met twee of meer bestanden. Er is geen instellingenveld vereist.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload 2-50 bestanden van elk type om te bundelen.

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

- Vereist tussen 2 en 50 invoerbestanden.
- Elk bestandstype wordt geaccepteerd; er zijn geen beperkingen op het invoerformaat.
- Als meerdere bestanden dezelfde naam delen, worden ze automatisch ontdubbeld met numerieke achtervoegsels.
- Het uitvoerarchief gebruikt standaard ZIP-compressie (deflate).
