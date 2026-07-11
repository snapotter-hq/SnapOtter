---
description: "Konvertiert zwischen Word-, OpenDocument-, RTF- und Klartextformaten."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 0c73f2b617c4
---

# Convert Document {#convert-document}

Konvertiert Dokumente mithilfe von LibreOffice zwischen den Formaten Word (DOCX), OpenDocument (ODT), RTF und Klartext.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Akzeptiert Multipart-Formulardaten mit einer Word-/ODT-/RTF-/TXT-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Ausgabeformat: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
```

## Example Response {#example-response}

Gibt `202 Accepted` zurück. Verfolge den Fortschritt per SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akzeptierte Eingabeformate: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Die Konvertierung wird von LibreOffice im Headless-Modus auf dem Server durchgeführt.
- Komplexe Formatierungen (Makros, eingebettete Objekte) überstehen die Konvertierung zwischen Formaten möglicherweise nicht.
- Das Ausgabeformat muss sich vom Eingabeformat unterscheiden.
