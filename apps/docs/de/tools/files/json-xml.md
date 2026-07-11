---
description: "Konvertiert zwischen JSON und XML, in beide Richtungen."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: a13754d9a95d
---

# JSON to XML {#json-to-xml}

Konvertiert zwischen den Formaten JSON und XML in beide Richtungen. Lade eine JSON-Datei hoch, um XML zu erhalten, oder lade eine XML-Datei hoch, um JSON zu erhalten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Akzeptiert Multipart-Formulardaten mit einer JSON- oder XML-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Nein | `true` | Ausgabe mit Einrückung formatiert ausgeben |

## Example Request {#example-request}

JSON zu XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML zu JSON:

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

- Die Konvertierungsrichtung wird automatisch aus der Dateierweiterung der Eingabe erkannt: `.json` erzeugt `.xml`, und `.xml` erzeugt `.json`.
- Der Parameter `pretty` gilt für beide Richtungen. Bei `false` ist die Ausgabe kompakt und ohne Einrückung.
- XML-Attribute und verschachtelte Strukturen bleiben bei der Hin- und Rückkonvertierung nach Möglichkeit erhalten.
