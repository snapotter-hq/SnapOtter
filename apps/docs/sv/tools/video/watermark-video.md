---
description: "Bränn in en textvattenstämpel på videobildrutor."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: fc5dfe90b136
---

# Vattenmärk video {#watermark-video}

Bränn in en textvattenstämpel på varje bildruta i en video med konfigurerbar position, storlek, opacitet och färg.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Vattenstämpeltext (1-200 tecken) |
| position | string | Nej | `"br"` | Position på bildrutan: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Nej | `36` | Teckenstorlek i pixlar (8-120) |
| opacity | number | Nej | `0.5` | Vattenstämpelns opacitet (0.05-1) |
| color | string | Nej | `"#ffffff"` | Hex-färg för texten (t.ex. `"#ffffff"`) |

### Positionsvärden {#position-values}

- **tl** - Uppe till vänster, **tc** - Uppe i mitten, **tr** - Uppe till höger
- **l** - Mitten till vänster, **c** - Mitten, **r** - Mitten till höger
- **bl** - Nere till vänster, **bc** - Nere i mitten, **br** - Nere till höger

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Anteckningar {#notes}

- Vattenstämpeln rendreras permanent in i videobildrutorna och kan inte tas bort efter bearbetning.
- Vattenstämpeln använder ett sans-serif-typsnitt inbyggt i FFmpeg.
- För bildvattenstämplar, använd bildverktyget Vattenmärke i stället.
