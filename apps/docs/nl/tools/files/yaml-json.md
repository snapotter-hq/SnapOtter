---
description: "Converteer tussen YAML en JSON, in beide richtingen."
i18n_source_hash: acf8ca21ee99
i18n_provenance: human
i18n_output_hash: abd1e7c91bd2
---

# YAML / JSON {#yaml-json}

Converteer tussen de formaten YAML en JSON in beide richtingen. Upload een YAML-bestand om JSON te krijgen, of upload een JSON-bestand om YAML te krijgen.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Accepteert multipart form data met een YAML- of JSON-bestand. Er is geen settings-veld vereist.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. De conversierichting wordt bepaald door de bestandsextensie van de invoer.

## Voorbeeldaanvraag {#example-request}

YAML naar JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON naar YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Opmerkingen {#notes}

- De conversierichting wordt automatisch gedetecteerd op basis van de bestandsextensie van de invoer: `.yaml` of `.yml` levert `.json` op, en `.json` levert `.yaml` op.
- Zowel de extensies `.yaml` als `.yml` worden geaccepteerd.
- Alleen het eerste document in een YAML-bestand met meerdere documenten wordt geconverteerd; aanvullende documenten die worden gescheiden door `---` worden genegeerd.
