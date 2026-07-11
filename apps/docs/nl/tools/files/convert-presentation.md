---
description: "Converteer tussen PowerPoint- en OpenDocument-presentatieformaten."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 8329aa5c43b7
---

# Convert Presentation {#convert-presentation}

Converteer presentaties tussen PowerPoint (PPTX) en OpenDocument Presentation (ODP) formaten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Accepteert multipart-formulierdata met een PowerPoint-/ODP-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Uitvoerformaat: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
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

- Geaccepteerde invoerformaten: `.pptx`, `.ppt`, `.odp`.
- De conversie wordt uitgevoerd door LibreOffice dat headless op de server draait.
- Animaties en overgangseffecten blijven mogelijk niet behouden bij conversie tussen formaten.
- Het uitvoerformaat moet verschillen van het invoerformaat.
