---
description: "Een tekstwatermerk in videoframes inbranden."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: c48312eff520
---

# Watermark Video {#watermark-video}

Brand een tekstwatermerk in elk frame van een video, met een instelbare positie, grootte, dekking en kleur.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Watermerktekst (1-200 tekens) |
| position | string | Nee | `"br"` | Positie op het frame: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Nee | `36` | Lettergrootte in pixels (8-120) |
| opacity | number | Nee | `0.5` | Dekking van het watermerk (0.05-1) |
| color | string | Nee | `"#ffffff"` | Hexkleur voor de tekst (bijv. `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Linksboven, **tc** - Midden boven, **tr** - Rechtsboven
- **l** - Midden links, **c** - Midden, **r** - Midden rechts
- **bl** - Linksonder, **bc** - Midden onder, **br** - Rechtsonder

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

- Het watermerk wordt permanent in de videoframes gerenderd en kan na de verwerking niet meer worden verwijderd.
- Het watermerk gebruikt een schreefloos lettertype dat in FFmpeg is ingebouwd.
- Voor beeldwatermerken gebruik je in plaats daarvan de image Watermark-tool.
