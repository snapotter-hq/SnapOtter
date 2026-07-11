---
description: "Mehrere CSV- oder TSV-Dateien mit übereinstimmenden Spalten zu einer einzigen zusammenführen."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 33951aeb8d6c
---

# CSVs zusammenführen {#merge-csvs}

Fügt mehrere CSV- oder TSV-Dateien mit übereinstimmenden Spalten zu einer einzigen zusammengeführten Datei zusammen. Alle Eingabedateien müssen dieselben Spaltenüberschriften haben.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Nimmt Multipart-Formulardaten mit zwei oder mehr CSV-Dateien entgegen. Es ist kein settings-Feld erforderlich.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Laden Sie 2 bis 20 CSV- oder TSV-Dateien mit übereinstimmenden Spaltenüberschriften hoch.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Hinweise {#notes}

- Erfordert zwischen 2 und 20 Eingabedateien.
- Alle Dateien müssen dieselben Spaltenüberschriften haben. Die Zusammenführung schlägt fehl, wenn die Spalten nicht übereinstimmen.
- Die Kopfzeile wird in der Ausgabe einmal aufgenommen; die Datenzeilen aller Dateien werden in der Reihenfolge des Uploads aneinandergehängt.
- Sowohl CSV- als auch TSV-Dateien werden akzeptiert, doch alle Dateien einer einzelnen Anfrage sollten dasselbe Trennzeichen verwenden.
