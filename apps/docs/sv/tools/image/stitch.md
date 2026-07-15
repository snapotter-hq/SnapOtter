---
description: "Foga samman bilder sida vid sida, staplade eller i ett rutnät med kontroll över justering, mellanrum, kanter och storleksändringsläge."
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: 2c395845781e
---

# Sammanfoga bilder {#stitch-combine}

Foga samman flera bilder sida vid sida, staplade vertikalt eller arrangerade i ett rutnät. Stöder justering, mellanrum, kant, hörnradie och flera storleksändringslägen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | Layoutriktning: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | Antal kolumner när riktningen är `grid` (2 till 100) |
| resizeMode | string | No | `"fit"` | Hur bilder storleksändras: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | Justering längs tväraxeln: `start`, `center`, `end` |
| gap | number | No | 0 | Mellanrum mellan bilder i pixlar (0 till 1000) |
| border | number | No | 0 | Yttre kantbredd i pixlar (0 till 500) |
| cornerRadius | number | No | 0 | Hörnradie som tillämpas på slutlig utdata (0 till 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Bakgrunds-/kantfärg i hex (t.ex. `#FF0000`) |
| format | string | No | `"png"` | Utdataformat: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Utdatakvalitet (1 till 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notes {#notes}

- Kräver minst 2 bilder. Ladda upp flera bildfiler i multipart-begäran.
- Stöder indataformaten HEIC, RAW, PSD och SVG (avkodas automatiskt).
- Storleksändringslägen:
  - `fit` - Skala bilder för att matcha den minsta dimensionen längs sammanfogningsaxeln.
  - `original` - Behåll originalstorlekar (kan ge ojämna kanter).
  - `stretch` - Tvinga bilder att matcha den minsta dimensionen utan att bevara bildförhållandet.
  - `crop` - Täckbeskär bilder för att matcha den minsta dimensionen.
- I läget `grid` dimensioneras cellerna efter medianvärdet av alla bilders dimensioner.
- `cornerRadius` tillämpas på hela den slutliga utdatan, inte på enskilda bilder.
- Arbetsytans storlek begränsas av serverkonfigurationen `MAX_CANVAS_PIXELS` för att förhindra minnesbrist.
