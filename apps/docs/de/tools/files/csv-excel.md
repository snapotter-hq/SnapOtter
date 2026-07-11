---
description: "Konvertiert zwischen CSV und Excel (XLSX), in beide Richtungen."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 258891f153c3
---

# CSV to Excel {#csv-to-excel}

Konvertiert zwischen den Formaten CSV und Excel (XLSX) in beide Richtungen. Lade eine CSV- oder TSV-Datei hoch, um XLSX zu erhalten, oder lade eine XLSX-Datei hoch, um CSV zu erhalten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Akzeptiert Multipart-Formulardaten mit einer CSV-, TSV- oder XLSX-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| sheet | integer | Nein | `1` | Nummer des zu exportierenden Arbeitsblatts beim Konvertieren aus XLSX (min. 1) |

## Example Request {#example-request}

CSV zu Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel zu CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- Die Konvertierungsrichtung wird automatisch aus der Dateierweiterung der Eingabe erkannt: `.csv` oder `.tsv` erzeugt `.xlsx`, und `.xlsx` erzeugt `.csv`.
- Der Parameter `sheet` gilt nur beim Konvertieren aus XLSX. Er wählt aus, welches Arbeitsblatt exportiert wird.
- TSV-Dateien (durch Tabulatoren getrennte Werte) werden neben CSV unterstützt.
