---
description: "Lägg till en textvattenstämpel på varje sida i en PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 46b3491dda9a
---

# Watermark PDF {#watermark-pdf}

Stämpla en textvattenstämpel på varje sida i en PDF med konfigurerbar position, storlek, opacitet och rotation.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Vattenstämpeltext (1-200 tecken) |
| position | string | Nej | `"c"` | Placering på sidan: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Nej | `48` | Teckenstorlek i punkter (6-72) |
| opacity | number | Nej | `0.3` | Vattenstämpelns opacitet (0.05-1) |
| rotation | number | Nej | `45` | Rotationsvinkel i grader (-180 till 180) |

### Position Values {#position-values}

- `tl` uppe till vänster, `tc` uppe i mitten, `tr` uppe till höger
- `l` mitten till vänster, `c` mitten, `r` mitten till höger
- `bl` nere till vänster, `bc` nere i mitten, `br` nere till höger

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

- Vattenstämpeln renderas som ett textöverlägg på varje sida.
- Samma vattenstämpeltext, position och stil tillämpas enhetligt på alla sidor.
- Använd lägre opacitetsvärden (0.1-0.3) för diskreta vattenstämplar som inte skymmer innehållet.
