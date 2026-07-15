---
description: "Konvertera mellan YAML och JSON, åt båda hållen."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: c16886cf2aef
---

# Konvertera YAML / JSON {#yaml-json}

Konvertera mellan formaten YAML och JSON åt båda hållen. Ladda upp en YAML-fil för att få JSON, eller ladda upp en JSON-fil för att få YAML.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Tar emot multipart-formulärdata med en YAML- eller JSON-fil. Inget settings-fält krävs.

## Parametrar {#parameters}

Det här verktyget har inga konfigurerbara parametrar. Konverteringsriktningen avgörs av indatafilens filändelse.

## Exempelförfrågan {#example-request}

YAML till JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON till YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Anteckningar {#notes}

- Konverteringsriktningen identifieras automatiskt utifrån indatafilens filändelse: `.yaml` eller `.yml` ger `.json`, och `.json` ger `.yaml`.
- Både filändelserna `.yaml` och `.yml` godtas.
- Endast det första dokumentet i en YAML-fil med flera dokument konverteras; ytterligare dokument som separeras med `---` ignoreras.
