---
description: "Eine CSV nach Zeilenanzahl in kleinere Dateien aufteilen."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 6d9c3a382794
---

# CSV aufteilen {#split-csv}

Teilt eine große CSV- oder TSV-Datei nach Zeilenanzahl in kleinere Dateien auf. Gibt ein ZIP-Archiv mit den Teilen zurück.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Nimmt Multipart-Formulardaten mit einer CSV-Datei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | Nein | `1000` | Anzahl der Datenzeilen pro Ausgabedatei (1-1.000.000) |
| keepHeader | boolean | Nein | `true` | Die Kopfzeile in jeder Ausgabedatei wiederholen |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Hinweise {#notes}

- Die Ausgabe ist immer ein ZIP-Archiv mit den aufgeteilten CSV-Teilen, die fortlaufend benannt sind (z. B. `part-1.csv`, `part-2.csv`).
- Wenn `keepHeader` auf `true` steht, enthält jeder Teil die ursprüngliche Kopfzeile, sodass jede Datei eigenständig verwendet werden kann.
- Sowohl CSV- als auch TSV-Dateien werden als Eingabe akzeptiert.
- Die Zeilenanzahl bezieht sich nur auf Datenzeilen; die Kopfzeile wird nicht mitgezählt.
