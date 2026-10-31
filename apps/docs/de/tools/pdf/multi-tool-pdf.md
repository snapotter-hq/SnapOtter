---
description: "Seiten in PDFs in einem Editor oder über die API neu anordnen, drehen, löschen und aus anderen PDFs übernehmen."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 6f93964bdbbb
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Stelle ein PDF aus einem expliziten Seitenplan zusammen: ordne Seiten neu an, dupliziere, drehe oder lösche sie und übernimm Seiten aus zusätzlichen PDFs – alles in einer Anfrage.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Akzeptiert Multipart-Formulardaten mit einer oder mehreren PDF-Dateien und einem JSON-Feld `settings`.
Pro Anfrage werden bis zu 20 Eingabedokumente und 1.200 Ausgabeseiten unterstützt.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Beschreibung |
|-----------|------|----------|-------------|
| items | array | Ja | Ausgabeseitenplan in Ausgabereihenfolge. Jedes Element ist `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indexiert die hochgeladenen Dateien in Upload-Reihenfolge (0-basiert); `page` ist eine 1-basierte Seitennummer in diesem Dokument. |
| pageCounts | array | Ja | Tatsächliche Seitenzahl jedes hochgeladenen Dokuments in derselben Reihenfolge. Eine Planseite, die über die Seitenzahl ihres Dokuments hinausgeht, wird mit 400 abgelehnt. |

## Beispielanfrage {#example-request}

Nimm die Seiten 3 und 1 des ersten Dokuments und dann die Seiten 1 und 2 des zweiten, wobei die erste Ausgabeseite um 90° im Uhrzeigersinn gedreht wird:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Hinweise {#notes}

- dieselbe Seite kann mehrmals in `items` erscheinen, um sie zu duplizieren.
- Seiten, die in `items` fehlen, werden aus der Ausgabe ausgelassen.
- `rot` zeichnet die neue Anzeigeausrichtung auf der kopierten Seite auf (zusammengesetzt mit einer vorhandenen Drehung); der Seiteninhalt bleibt unverändert.
- Die Drehung wird pro Ausgabekopie angewendet, sodass Duplikate unterschiedliche Drehungen haben können.
- Die Ausgabe ist ein neues, flaches Dokument; Quell-Lesezeichen und Dokumentmetadaten auf Dokumentebene werden nicht übernommen.
- Die Verarbeitung erfordert die qpdf-Binärdatei, die im offiziellen Docker-Image enthalten ist.
