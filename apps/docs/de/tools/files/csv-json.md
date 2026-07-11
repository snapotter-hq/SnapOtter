---
description: "Konvertiert zwischen CSV und JSON, in beide Richtungen."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 62671e7712c0
---

# CSV to JSON {#csv-to-json}

Konvertiert zwischen den Formaten CSV und JSON in beide Richtungen. Lade eine CSV- oder TSV-Datei hoch, um ein JSON-Array von Objekten zu erhalten, oder lade ein JSON-Array hoch, um eine CSV-Datei zu erhalten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Akzeptiert Multipart-Formulardaten mit einer CSV-, TSV- oder JSON-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Nein | `true` | JSON-Ausgabe mit Einrückung formatiert ausgeben |

## Example Request {#example-request}

CSV zu JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON zu CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- Die Konvertierungsrichtung wird automatisch aus der Dateierweiterung der Eingabe erkannt: `.csv` oder `.tsv` erzeugt `.json`, und `.json` erzeugt `.csv`.
- Der Parameter `pretty` wirkt sich nur auf die JSON-Ausgabe aus. Wenn er auf `false` gesetzt ist, ist die Ausgabe ein kompakter, einzeiliger JSON-String.
- Die JSON-Eingabe muss ein Array von Objekten mit konsistenten Schlüsseln sein. Jedes Objekt wird zu einer Zeile, und jeder Schlüssel wird zu einer Spaltenüberschrift.
- TSV-Dateien (durch Tabulatoren getrennte Werte) werden neben CSV unterstützt.
