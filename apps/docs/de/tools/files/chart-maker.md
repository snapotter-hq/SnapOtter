---
description: "Erstellt Balken-, Linien- oder Kreisdiagramme aus CSV- oder JSON-Daten."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: abda7f7fbe89
---

# Chart Maker {#chart-maker}

Erstellt Balken-, Linien- oder Kreisdiagramme aus CSV- oder JSON-Daten. Gibt ein PNG-Bild des gerenderten Diagramms zurück.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Akzeptiert Multipart-Formulardaten mit einer CSV- oder JSON-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| kind | string | Nein | `"bar"` | Diagrammtyp: `bar`, `line`, `pie` |
| title | string | Nein | - | Diagrammtitel (max. 120 Zeichen) |
| width | integer | Nein | `960` | Diagrammbreite in Pixeln (320-2048) |
| height | integer | Nein | `540` | Diagrammhöhe in Pixeln (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- Die Eingabe muss eine `.csv`- oder `.json`-Datei sein. CSV-Dateien sollten eine Kopfzeile mit Spaltennamen haben.
- Die erste Spalte wird als Kategoriebezeichnung verwendet; die zweite Spalte muss numerisch sein und liefert die Datenwerte. Es werden nur zwei Spalten verwendet.
- Die JSON-Eingabe sollte ein Array von `{label, value}`-Objekten sein oder ein einfaches Objekt, dessen Schlüssel zu Bezeichnungen und dessen Werte zu Datenpunkten werden.
- Maximal 100 Datenpunkte. Alle Werte müssen null oder größer sein.
- Die Ausgabe ist unabhängig vom Eingabeformat immer ein PNG-Bild.
