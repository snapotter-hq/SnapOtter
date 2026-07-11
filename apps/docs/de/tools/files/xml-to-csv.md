---
description: "Sich wiederholende Elemente aus XML in eine CSV-Tabelle extrahieren."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 492d543e1a85
---

# XML zu CSV {#xml-to-csv}

Extrahiert sich wiederholende Elemente aus einer XML-Datei in eine flache CSV-Tabelle. Das Werkzeug findet automatisch das erste Array von Objekten im XML-Baum und ordnet jedes Element einer Zeile zu.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Nimmt Multipart-Formulardaten mit einer XML-Datei entgegen. Es ist kein settings-Feld erforderlich.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Das sich wiederholende Element wird automatisch aus der XML-Struktur erkannt.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Hinweise {#notes}

- Nur `.xml`-Dateien werden als Eingabe akzeptiert.
- Das Werkzeug durchsucht den XML-Baum nach der ersten sich wiederholenden Menge gleichrangiger Elemente und verwendet diese als Zeilen.
- Jeder eindeutige Name eines Kindelements oder Attributs wird zu einer CSV-Spaltenüberschrift.
- Dies ist eine einseitige Umwandlung. Für eine bidirektionale JSON-/XML-Umwandlung verwenden Sie das Werkzeug [JSON zu XML](/de/tools/files/json-xml).
