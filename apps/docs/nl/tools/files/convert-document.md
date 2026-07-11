---
description: "Converteer tussen Word-, OpenDocument-, RTF- en platte-tekstformaten."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 1f4adf01567a
---

# Convert Document {#convert-document}

Converteer documenten tussen Word (DOCX), OpenDocument (ODT), RTF en platte-tekstformaten met LibreOffice.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Accepteert multipart-formulierdata met een Word-/ODT-/RTF-/TXT-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Uitvoerformaat: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
```

## Example Response {#example-response}

Retourneert `202 Accepted`. Volg de voortgang via SSE op `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Geaccepteerde invoerformaten: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- De conversie wordt uitgevoerd door LibreOffice dat headless op de server draait.
- Complexe opmaak (macro's, ingesloten objecten) blijft mogelijk niet behouden bij conversie tussen formaten.
- Het uitvoerformaat moet verschillen van het invoerformaat.
