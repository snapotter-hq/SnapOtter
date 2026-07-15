---
description: "Dela en bild i rutnätsplattor efter rader och kolumner eller efter pixelstorlek, returnerat som ett ZIP-arkiv."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 59d8521bc5bc
---

# Dela bild {#image-splitting}

Dela en enda bild i rutnätsplattor efter antal kolumner/rader eller efter specifika pixeldimensioner. Returnerar ett ZIP-arkiv som innehåller alla plattor.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | Antal kolumner att dela upp i (1 till 100) |
| rows | integer | No | 3 | Antal rader att dela upp i (1 till 100) |
| tileWidth | integer | No | - | Plattbredd i pixlar (min 10). Åsidosätter `columns` när både `tileWidth` och `tileHeight` är angivna. |
| tileHeight | integer | No | - | Platthöjd i pixlar (min 10). Åsidosätter `rows` när både `tileWidth` och `tileHeight` är angivna. |
| outputFormat | string | No | `"original"` | Utdataformat för plattor: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Utdatakvalitet för destruktiva format (1 till 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Example Response {#example-response}

Svaret strömmas direkt som en ZIP-fil med `Content-Type: application/zip`. Filnamnet följer mönstret `split-<jobId>.zip`.

Varje platta inuti ZIP-filen namnges `<originalBaseName>_r<row>_c<col>.<ext>` (t.ex. `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Notes {#notes}

- Tar emot en enda bildfil.
- Stöder indataformaten HEIC, RAW, PSD och SVG (avkodas automatiskt).
- När både `tileWidth` och `tileHeight` anges har de företräde framför `columns`/`rows`. Rutnätsdimensionerna beräknas som `ceil(imageWidth / tileWidth)` och `ceil(imageHeight / tileHeight)`.
- Kantplattor (kolumnen längst till höger, understa raden) kan vara mindre än den angivna plattstorleken om bildens dimensioner inte är jämnt delbara.
- Maximal rutnätsstorlek är begränsad till 100x100 (10 000 plattor).
- Svaret strömmar ZIP-filen direkt, så det finns ingen JSON-svarskropp. Använd `--output` med curl för att spara filen.
