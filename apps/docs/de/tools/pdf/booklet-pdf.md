---
description: "PDF-Seiten so anordnen, dass sie zu einer Broschüre gefaltet werden können."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 5b9588a49f4b
---

# Broschüren-PDF {#booklet-pdf}

Ordnet Seiten für den beidseitigen Druck an, sodass die gedruckten Bögen zu einer Broschüre gefaltet werden können.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Nimmt Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Nein | `2` | Seiten pro Bogen: `2`, `4`, `6` oder `8` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Hinweise {#notes}

- Der Standardwert `perSheet: 2` platziert zwei Seiten nebeneinander auf jedem Bogen, was das übliche Broschürenlayout für den beidseitigen Druck ist.
- Leere Seiten werden automatisch hinzugefügt, wenn die Gesamtseitenzahl kein Vielfaches der Bogengröße ist.
- Drucken Sie die Ausgabe doppelseitig mit Bindung an der kurzen Kante, falten und heften Sie sie anschließend.
