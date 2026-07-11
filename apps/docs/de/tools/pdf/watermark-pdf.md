---
description: "Ein Textwasserzeichen zu jeder Seite einer PDF hinzufügen."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: f67c4ace106e
---

# PDF mit Wasserzeichen versehen {#watermark-pdf}

Stempeln Sie ein Textwasserzeichen auf jede Seite einer PDF mit konfigurierbarer Position, Größe, Deckkraft und Drehung.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Wasserzeichentext (1-200 Zeichen) |
| position | string | Nein | `"c"` | Platzierung auf der Seite: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Nein | `48` | Schriftgröße in Punkten (6-72) |
| opacity | number | Nein | `0.3` | Deckkraft des Wasserzeichens (0.05-1) |
| rotation | number | Nein | `45` | Drehwinkel in Grad (-180 bis 180) |

### Position Values {#position-values}

- `tl` oben links, `tc` oben Mitte, `tr` oben rechts
- `l` Mitte links, `c` Mitte, `r` Mitte rechts
- `bl` unten links, `bc` unten Mitte, `br` unten rechts

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Das Wasserzeichen wird als Textüberlagerung auf jeder Seite gerendert.
- Derselbe Wasserzeichentext, dieselbe Position und derselbe Stil werden einheitlich auf alle Seiten angewendet.
- Verwenden Sie niedrigere Deckkraftwerte (0.1-0.3) für dezente Wasserzeichen, die den Inhalt nicht verdecken.
