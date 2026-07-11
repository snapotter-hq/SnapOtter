---
description: "Word-Dokumente in PDF umwandeln."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 9bd1eed251de
---

# Word zu PDF {#word-to-pdf}

Wandelt Word-Dokumente, OpenDocument-Text, RTF oder Klartextdateien in ein PDF um.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Nimmt Multipart-Formulardaten mit einer Word-/ODT-/RTF-/TXT-Datei entgegen.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Laden Sie ein Dokument hoch, und es wird in ein PDF umgewandelt.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
```

## Beispielantwort {#example-response}

Gibt `202 Accepted` zurück. Verfolgen Sie den Fortschritt per SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Hinweise {#notes}

- Akzeptierte Eingabeformate: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Die Umwandlung übernimmt LibreOffice, das auf dem Server im Headless-Modus läuft.
- In das Dokument eingebettete Schriftarten werden verwendet, sofern verfügbar; andernfalls werden Systemschriftarten ersetzt.
- Kopf- und Fußzeilen, Tabellen und Bilder bleiben in der PDF-Ausgabe erhalten.
