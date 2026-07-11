---
description: "Eén afbeelding opsplitsen in rastertegels op basis van rijen en kolommen of op pixelgrootte, geretourneerd als ZIP-archief."
i18n_source_hash: 57a2e11e7cce
i18n_provenance: human
i18n_output_hash: b64e36398c5b
---

# Afbeelding Opsplitsen {#image-splitting}

Splits één afbeelding op in rastertegels op basis van het aantal kolommen/rijen of specifieke pixelafmetingen. Retourneert een ZIP-archief met alle tegels.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| columns | integer | Nee | 3 | Aantal kolommen om in op te splitsen (1 tot 100) |
| rows | integer | Nee | 3 | Aantal rijen om in op te splitsen (1 tot 100) |
| tileWidth | integer | Nee | - | Tegelbreedte in pixels (min. 10). Overschrijft `columns` wanneer zowel `tileWidth` als `tileHeight` zijn ingesteld. |
| tileHeight | integer | Nee | - | Tegelhoogte in pixels (min. 10). Overschrijft `rows` wanneer zowel `tileWidth` als `tileHeight` zijn ingesteld. |
| outputFormat | string | Nee | `"original"` | Uitvoerformaat voor tegels: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Nee | 90 | Uitvoerkwaliteit voor lossy formaten (1 tot 100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Voorbeeldrespons {#example-response}

De respons wordt rechtstreeks gestreamd als een ZIP-bestand met `Content-Type: application/zip`. De bestandsnaam volgt het patroon `split-<jobId>.zip`.

Elke tegel in de ZIP heet `<originalBaseName>_r<row>_c<col>.<ext>` (bijv. `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Opmerkingen {#notes}

- Accepteert één afbeeldingsbestand.
- Ondersteunt HEIC-, RAW-, PSD- en SVG-invoerformaten (automatisch gedecodeerd).
- Wanneer zowel `tileWidth` als `tileHeight` zijn opgegeven, krijgen deze voorrang boven `columns`/`rows`. De rasterafmetingen worden berekend als `ceil(imageWidth / tileWidth)` en `ceil(imageHeight / tileHeight)`.
- Randtegels (meest rechtse kolom, onderste rij) kunnen kleiner zijn dan de opgegeven tegelgrootte als de afbeeldingsafmetingen niet gelijkmatig deelbaar zijn.
- De maximale rastergrootte is begrensd op 100x100 (10.000 tegels).
- De respons streamt de ZIP rechtstreeks, dus er is geen JSON-responsbody. Gebruik `--output` met curl om het bestand op te slaan.
