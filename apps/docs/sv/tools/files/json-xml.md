---
description: "Konvertera mellan JSON och XML, i båda riktningarna."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 2ef23de04873
---

# JSON to XML {#json-to-xml}

Konvertera mellan formaten JSON och XML i båda riktningarna. Ladda upp en JSON-fil för att få XML, eller ladda upp en XML-fil för att få JSON.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Tar emot multipart-formulärdata med en JSON- eller XML-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Formatera utdata snyggt med indrag |

## Example Request {#example-request}

JSON till XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML till JSON:

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

- Konverteringsriktningen identifieras automatiskt från indatafilens filändelse: `.json` ger `.xml`, och `.xml` ger `.json`.
- Parametern `pretty` gäller i båda riktningarna. När den är `false` blir utdata kompakt utan indrag.
- XML-attribut och kapslade strukturer bevaras vid tur-och-retur-konvertering där så är möjligt.
