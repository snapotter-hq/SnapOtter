---
description: "Lägg till textvattenstämplar med konfigurerbar position, opacitet, rotation och plattläggning."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 55fc2bbf30bd
---

# Textvattenstämpel {#text-watermark}

Lägg till ett textvattenstämpelöverlägg på bilder. Stöder enkel placering i hörn/mitt eller plattlagd upprepning över hela bilden, med konfigurerbar teckenstorlek, färg, opacitet och rotation.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Vattenstämpeltext (1 till 500 tecken) |
| fontSize | number | No | `48` | Teckenstorlek i pixlar (8 till 1000) |
| color | string | No | `"#000000"` | Textfärg i hex-format (`#RRGGBB`) |
| opacity | number | No | `50` | Textopacitet i procent (0 till 100) |
| position | string | No | `"center"` | Placering: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | Textrotationsvinkel i grader (-360 till 360) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Plattlagd vattenstämpel över hela bilden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- Vattenstämpeln renderas som SVG-text och komponeras på bilden, vilket bevarar utdatakvaliteten.
- Plattlagt läge fördelar textelement baserat på teckenstorlek (6x horisontellt, 4x vertikalt mellanrum), begränsat till maximalt 500 element.
- För hörnpositioner är utfyllnaden från kanten lika med teckenstorleken.
- Teckensnittet som används är systemets standardteckensnitt utan seriffer.
- XML-specialtecken i texten (`&`, `<`, `>`, `"`, `'`) escapas säkert.
- Utdataformatet matchar indataformatet. HEIC, RAW, PSD och SVG-indata avkodas automatiskt före bearbetning.
