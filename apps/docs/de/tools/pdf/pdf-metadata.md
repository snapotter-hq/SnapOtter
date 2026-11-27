---
description: "PDF-Dokumentmetadaten lesen und schreiben."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: d06ddbf02a7e
i18n_hash_version: 2
---

# PDF-Metadaten {#pdf-metadata}

Lesen und aktualisieren Sie PDF-Dokumentmetadatenfelder wie Titel, Autor, Betreff und Schlüsselwörter, oder entfernen Sie die Metadaten des Dokuments vollständig. Wenn keine Einstellungen angegeben werden, werden die vorhandenen Metadaten unverändert zurückgegeben.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem optionalen JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| title | string | Nein | - | Dokumenttitel (max. 500 Zeichen) |
| author | string | Nein | - | Dokumentautor (max. 500 Zeichen) |
| subject | string | Nein | - | Dokumentbetreff (max. 500 Zeichen) |
| keywords | string | Nein | - | Dokumentschlüsselwörter (max. 500 Zeichen) |
| stripAll | boolean | Nein | false | Entfernt das gesamte Info-Dictionary (Datumsangaben, Creator, Producer, benutzerdefinierte Schlüssel), jeden XMP-Stream (Dokument, Seiten, Bilder) und alle PieceInfo-Anwendungsdaten und schreibt dann die oben angegebenen Felder |
| removeAttachments | boolean | Nein | false | Entfernt zusätzlich eingebettete Dateien: die Anhangsliste des Dokuments, Dateianhang-Annotationen und zugehörige Dateien (`/AF`). Erfordert `stripAll` |

Alle Parameter sind optional. Weggelassene Felder bleiben unverändert, sofern nicht `stripAll` gesetzt ist.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- Dies ist ein schnelles (synchrones) Tool, das das Ergebnis direkt zurückgibt.
- Das Feld `metadata` in der Antwort enthält die resultierenden Metadaten nach etwaigen Aktualisierungen.
- Um Metadaten zu lesen, ohne sie zu ändern, lassen Sie das Feld `settings` weg oder senden Sie ein leeres Objekt.
- Jedes Metadatenfeld ist auf 500 Zeichen begrenzt.
- Mit `stripAll` enthält die Antwort zusätzlich `stripped`: die entfernten Info-Schlüssel (`removed`), ob der XMP-Stream des Dokuments entfernt wurde (`xmpRemoved`), die vom Eingabedokument deklarierte PDF/A-Stufe (`pdfa` oder `null`), wie viele XMP-Streams von Seiten, Bildern und anderen Objekten entfernt wurden (`objectXmpRemoved`), wie viele PieceInfo-Dictionaries entfernt wurden (`pieceInfoRemoved`) und wie viele eingebettete Dateien entfernt wurden (`attachmentsRemoved`, ohne `removeAttachments` immer `0`). Das Entfernen von XMP bricht die PDF/A-Konformität.
- `stripAll` allein behält eingebettete Dateianhänge bei, da deren Entfernung den Inhalt des Dokuments verändert. Füge `removeAttachments` hinzu, um sie ebenfalls zu entfernen. Das entfernt das angehängte XML aus ZUGFeRD- und Factur-X-E-Rechnungen und bricht die PDF/A-3-Konformität.
- Wird `removeAttachments` ohne `stripAll` gesendet, wird mit 400 geantwortet.
