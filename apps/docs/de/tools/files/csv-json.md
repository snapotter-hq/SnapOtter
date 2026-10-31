---
description: "Konvertiert zwischen CSV und JSON, in beide Richtungen."
i18n_source_hash: 5b24abf5e9d2
i18n_provenance: human
i18n_output_hash: 4418a907faca
---

# CSV to JSON {#csv-to-json}

Konvertiert zwischen den Formaten CSV und JSON in beide Richtungen. Lade eine CSV- oder TSV-Datei hoch, um ein JSON-Array von Objekten zu erhalten, oder lade JSON hoch (ein Array von Objekten oder ein Objekt, das eines enthält), um eine CSV-Datei zu erhalten.

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
- Die JSON-Eingabe kann ein Array von Objekten sein, ein Objekt mit einem einzigen Schlüssel, der ein solches Array enthält (etwa `{"data": [...]}`), oder ein flaches Objekt aus einfachen Werten. Jedes Objekt wird zu einer Zeile, und jeder Schlüssel wird zu einer Spaltenüberschrift. Ein flaches Objekt ergibt eine Tabelle mit den zwei Spalten `key,value`. Objekte mit mehreren Schlüsseln auf oberster Ebene und leere Arrays werden abgelehnt.
- TSV-Dateien (durch Tabulatoren getrennte Werte) werden neben CSV unterstützt.
