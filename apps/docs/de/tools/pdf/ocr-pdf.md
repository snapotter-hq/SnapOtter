---
description: "Text aus PDF-Dokumenten mit KI-gestützter OCR extrahieren."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: b09a98f42048
---

# PDF OCR {#pdf-ocr}

Extrahieren Sie Text aus PDF-Dokumenten mithilfe KI-gestützter optischer Zeichenerkennung. Unterstützt mehrere Qualitätsstufen und Sprachen. Erfordert die Installation des OCR-Feature-Bundles.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem optionalen JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| quality | string | Nein | `"balanced"` | OCR-Qualitätsstufe: `fast`, `balanced`, `best` |
| language | string | Nein | `"auto"` | Dokumentsprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Nein | `"all"` | Seitenauswahl, z. B. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

Gibt `202 Accepted` zurück. Verfolgen Sie den Fortschritt über SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- Dies ist ein KI-Tool, das die Installation des **OCR-Feature-Bundles** erfordert. Wenn das Bundle nicht installiert ist, gibt die API `501 Not Implemented` zurück.
- Die Qualitätsstufe `fast` verwendet ein leichteres Modell für eine schnellere Verarbeitung; `best` verwendet ein genaueres Modell auf Kosten der Geschwindigkeit.
- Die Spracheinstellung `auto` versucht, die Dokumentsprache automatisch zu erkennen.
- Sie können bestimmte Seiten über Bereiche (`"1-3"`), kommagetrennte Listen (`"1,3,5"`) oder `"all"` für jede Seite gezielt ansprechen.
- Für PDFs, die bereits auswählbaren Text enthalten, sollten Sie stattdessen das schnellere Tool [PDF zu Text](./pdf-to-text) verwenden.
