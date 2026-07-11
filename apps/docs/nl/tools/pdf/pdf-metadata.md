---
description: "Lees en schrijf PDF-documentmetadata."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 68b0b9e34a84
---

# PDF Metadata {#pdf-metadata}

Lees en werk metadatavelden van een PDF-document bij, zoals titel, auteur, onderwerp en trefwoorden. Wanneer er geen instellingen worden opgegeven, wordt de bestaande metadata zonder wijziging teruggegeven.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Accepteert multipart-formuliergegevens met een PDF-bestand en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| title | string | Nee | - | Documenttitel (max. 500 tekens) |
| author | string | Nee | - | Documentauteur (max. 500 tekens) |
| subject | string | Nee | - | Documentonderwerp (max. 500 tekens) |
| keywords | string | Nee | - | Documenttrefwoorden (max. 500 tekens) |

Alle parameters zijn optioneel. Weggelaten velden blijven ongewijzigd.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Geaccepteerd invoerformaat: `.pdf`.
- Dit is een snel (synchroon) hulpmiddel dat het resultaat direct teruggeeft.
- Het veld `metadata` in het antwoord bevat de resulterende metadata na eventuele updates.
- Om metadata te lezen zonder deze te wijzigen, laat je het veld `settings` weg of stuur je een leeg object.
- Elk metadataveld is beperkt tot 500 tekens.
