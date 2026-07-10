---
description: "Kombinera flera bilder till ett enda sprite sheet-rutnät med bildruteinformation."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: d44e297b1317
---

# Sprite Sheet {#sprite-sheet}

Kombinera flera bilder till ett enda sprite sheet-rutnät. Varje bild storleksändras för att matcha den första bildens dimensioner och placeras i rutnätet. Returnerar sprite sheet-bilden tillsammans med koordinatinformation per bildruta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Tar emot multipart-formulärdata med två eller fler bildfiler och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | Antal kolumner i rutnätet (1-16) |
| padding | integer | No | `0` | Utfyllnad mellan celler i pixlar (0-64) |
| background | string | No | `"#ffffff"` | Bakgrundsfärg i hex |
| format | string | No | `"png"` | Utdataformat: `png`, `webp` eller `jpeg` |
| quality | integer | No | `90` | Utdatakvalitet (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notes {#notes}

- Tar emot 2 till 64 bilder. Alla bilder storleksändras för att matcha dimensionerna på den första uppladdade bilden.
- Arrayen `frames` tillhandahåller de exakta pixelkoordinaterna för varje bildruta i utdata, lämpliga för CSS-spritedefinitioner eller bildrutekartor i spelmotorer.
- Antalet rader beräknas automatiskt utifrån bildantalet och värdet `columns`.
- Använd parametern `padding` för att lägga till mellanrum mellan celler. Färgen `background` är synlig i utfyllnadsområden och eventuella tomma efterföljande celler.
- HEIC, RAW, PSD och SVG-indata avkodas automatiskt före bearbetning.
