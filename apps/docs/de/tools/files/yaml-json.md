---
description: "In beide Richtungen zwischen YAML und JSON umwandeln."
i18n_source_hash: acf8ca21ee99
i18n_provenance: human
i18n_output_hash: 90e892bde21b
---

# YAML / JSON {#yaml-json}

Wandelt in beide Richtungen zwischen den Formaten YAML und JSON um. Laden Sie eine YAML-Datei hoch, um JSON zu erhalten, oder laden Sie eine JSON-Datei hoch, um YAML zu erhalten.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Nimmt Multipart-Formulardaten mit einer YAML- oder JSON-Datei entgegen. Es ist kein settings-Feld erforderlich.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Die Umwandlungsrichtung wird anhand der Dateiendung der Eingabe bestimmt.

## Beispielanfrage {#example-request}

YAML zu JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON zu YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Hinweise {#notes}

- Die Umwandlungsrichtung wird automatisch anhand der Dateiendung der Eingabe erkannt: `.yaml` oder `.yml` erzeugt `.json`, und `.json` erzeugt `.yaml`.
- Sowohl die Endung `.yaml` als auch `.yml` wird akzeptiert.
- Nur das erste Dokument einer YAML-Datei mit mehreren Dokumenten wird umgewandelt; weitere, durch `---` getrennte Dokumente werden ignoriert.
