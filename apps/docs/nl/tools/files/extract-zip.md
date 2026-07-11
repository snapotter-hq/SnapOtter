---
description: "Pak bestanden veilig uit een ZIP-archief uit met bombeveiliging."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 02174d19b811
---

# Extract ZIP {#extract-zip}

Pak bestanden veilig uit een ZIP-archief. Archieven met één bestand retourneren het bevatte bestand rechtstreeks; archieven met meerdere bestanden retourneren een platte ZIP met de uitgepakte inhoud.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Accepteert multipart-formulierdata met een ZIP-bestand. Er is geen instellingenveld vereist.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een `.zip`-bestand om uit te pakken.

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

- Alleen `.zip`-bestanden worden als invoer geaccepteerd.
- Als het archief één bestand bevat, wordt dat bestand rechtstreeks geretourneerd (niet in een ZIP verpakt).
- Als het archief meerdere bestanden bevat, wordt een platte ZIP geretourneerd met alle bestanden uitgepakt op het rootniveau (geneste mappenstructuur wordt afgevlakt).
- Ingebouwde bombeveiliging weigert archieven met buitensporige compressieverhoudingen of bestandsaantallen om uitputting van bronnen te voorkomen.
