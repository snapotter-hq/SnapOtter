---
description: "Word-, Markdown-, HTML- oder Klartextdateien in EPUB umwandeln."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: c06baec84ade
---

# In EPUB umwandeln {#convert-to-epub}

Wandelt Word-Dokumente, Markdown, HTML oder Klartextdateien in das E-Book-Format EPUB um.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Nimmt Multipart-Formulardaten mit einer Word-/Markdown-/HTML-/TXT-Datei entgegen.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Laden Sie ein Dokument hoch, und es wird in ein EPUB umgewandelt.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- Akzeptierte Eingabeformate: `.docx`, `.md`, `.html`, `.txt`.
- Die EPUB-Ausgabe folgt der Spezifikation EPUB 3.
- Überschriften im Quelldokument werden zum Erzeugen des Inhaltsverzeichnisses verwendet.
- Die Umwandlung übernimmt Pandoc auf dem Server.
