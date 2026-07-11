---
description: "Mehrere PDFs zu einem einzigen Dokument zusammenführen."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: ed5e5472f3a5
---

# PDFs zusammenführen {#merge-pdfs}

Fügen Sie zwei oder mehr PDF-Dateien zu einem einzigen Dokument zusammen, wobei die Seitenreihenfolge jeder Eingabedatei erhalten bleibt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Akzeptiert Multipart-Formulardaten mit zwei oder mehr PDF-Dateien. Es ist kein Feld `settings` erforderlich.

## Parameters {#parameters}

Dieses Tool hat keine Einstellungsparameter. Laden Sie einfach zwei oder mehr PDF-Dateien hoch.

| Einschränkung | Wert |
|------------|-------|
| Mindestanzahl Dateien | 2 |
| Maximale Anzahl Dateien | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Dateien werden in der Reihenfolge zusammengeführt, in der sie hochgeladen werden.
- Es sind mindestens zwei PDF-Dateien erforderlich; die Anfrage schlägt mit einem 400-Fehler fehl, wenn weniger angegeben werden.
- Die maximale Anzahl an Eingabedateien beträgt 20.
- Verschlüsselte PDFs müssen vor dem Zusammenführen entsperrt werden.
