---
description: "Afbeeldingen naast elkaar, gestapeld of in een raster samenvoegen, met controle over uitlijning, tussenruimtes, randen en schaalmodus."
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: 20f87ea80878
---

# Afbeeldingen samenvoegen {#stitch-combine}

Voeg meerdere afbeeldingen naast elkaar, verticaal gestapeld of gerangschikt in een raster samen. Ondersteunt uitlijning, tussenruimte, rand, hoekradius en meerdere schaalmodi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| direction | string | Nee | `"horizontal"` | Lay-outrichting: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | Nee | 2 | Aantal kolommen wanneer de richting `grid` is (2 tot 100) |
| resizeMode | string | Nee | `"fit"` | Hoe afbeeldingen worden geschaald: `fit`, `original`, `stretch`, `crop` |
| alignment | string | Nee | `"center"` | Uitlijning op de dwarsas: `start`, `center`, `end` |
| gap | number | Nee | 0 | Tussenruimte tussen afbeeldingen in pixels (0 tot 1000) |
| border | number | Nee | 0 | Breedte van de buitenrand in pixels (0 tot 500) |
| cornerRadius | number | Nee | 0 | Hoekradius toegepast op de uiteindelijke uitvoer (0 tot 500) |
| backgroundColor | string | Nee | `"#FFFFFF"` | Achtergrond-/randkleur als hex (bijv. `#FF0000`) |
| format | string | Nee | `"png"` | Uitvoerformaat: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nee | 90 | Uitvoerkwaliteit (1 tot 100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Opmerkingen {#notes}

- Vereist ten minste 2 afbeeldingen. Upload meerdere afbeeldingsbestanden in het multipart-verzoek.
- Ondersteunt HEIC-, RAW-, PSD- en SVG-invoerformaten (automatisch gedecodeerd).
- Schaalmodi:
  - `fit` - Schaal afbeeldingen zodat ze overeenkomen met de kleinste afmeting langs de samenvoegas.
  - `original` - Behoud de oorspronkelijke afmetingen (kan ongelijke randen opleveren).
  - `stretch` - Dwing afbeeldingen om overeen te komen met de kleinste afmeting zonder de beeldverhouding te behouden.
  - `crop` - Snijd afbeeldingen dekkend bij om overeen te komen met de kleinste afmeting.
- In de modus `grid` worden cellen op de mediane afmetingen van alle afbeeldingen geschaald.
- De `cornerRadius` wordt toegepast op de gehele uiteindelijke uitvoer, niet op individuele afbeeldingen.
- De canvasgrootte wordt begrensd door de serverconfiguratie `MAX_CANVAS_PIXELS` om geheugenuitputting te voorkomen.
