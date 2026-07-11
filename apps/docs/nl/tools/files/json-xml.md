---
description: "Converteer tussen JSON en XML, in beide richtingen."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 66e17be85fcb
---

# JSON to XML {#json-to-xml}

Converteer tussen JSON- en XML-formaten in beide richtingen. Upload een JSON-bestand om XML te krijgen, of upload een XML-bestand om JSON te krijgen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Accepteert multipart-formulierdata met een JSON- of XML-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Nee | `true` | Uitvoer opmaken met inspringing |

## Example Request {#example-request}

JSON naar XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML naar JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- De conversierichting wordt automatisch bepaald op basis van de bestandsextensie van de invoer: `.json` levert `.xml`, en `.xml` levert `.json`.
- De parameter `pretty` is van toepassing op beide richtingen. Wanneer `false`, is de uitvoer compact zonder inspringing.
- XML-attributen en geneste structuren blijven waar mogelijk behouden tijdens conversie heen en terug.
