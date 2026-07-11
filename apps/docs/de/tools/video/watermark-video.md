---
description: "Ein Text-Wasserzeichen in Videoframes einbrennen."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 10ed166a9871
---

# Watermark Video {#watermark-video}

Ein Text-Wasserzeichen mit konfigurierbarer Position, Größe, Deckkraft und Farbe in jeden Frame eines Videos einbrennen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Wasserzeichentext (1-200 Zeichen) |
| position | string | No | `"br"` | Position auf dem Frame: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Schriftgröße in Pixeln (8-120) |
| opacity | number | No | `0.5` | Deckkraft des Wasserzeichens (0.05-1) |
| color | string | No | `"#ffffff"` | Hex-Farbe für den Text (z. B. `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Oben links, **tc** - Oben mittig, **tr** - Oben rechts
- **l** - Mitte links, **c** - Mitte, **r** - Mitte rechts
- **bl** - Unten links, **bc** - Unten mittig, **br** - Unten rechts

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Das Wasserzeichen wird dauerhaft in die Videoframes gerendert und kann nach der Verarbeitung nicht mehr entfernt werden.
- Das Wasserzeichen verwendet eine in FFmpeg integrierte serifenlose Schrift.
- Für Bild-Wasserzeichen verwenden Sie stattdessen das Bild-Tool Watermark.
