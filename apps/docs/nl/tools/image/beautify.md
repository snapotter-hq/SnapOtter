---
description: "Zet gewone schermafbeeldingen om in verzorgde beelden met verloopachtergronden, apparaatframes, schaduwen en formaten voor social media."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 3db6623d8406
---

# Schermafbeelding verfraaien {#beautify-screenshot}

Voeg verloopachtergronden, apparaatframes, schaduwen, watermerken en formaten voor social media toe aan schermafbeeldingen. Ideaal om verzorgde beelden te maken voor productmarketing, social media en documentatie.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Nee | `"linear-gradient"` | Achtergrondtype: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | Nee | `"#667eea"` | Effen achtergrondkleur (gebruikt wanneer `backgroundType` `solid` is) |
| gradientStops | array | Nee | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Kleurstops van het verloop (min. 2). Elke stop heeft `color` (hex) en `position` (0-100). |
| gradientAngle | number | Nee | 135 | Verloophoek in graden (0 tot 360) |
| padding | number | Nee | 64 | Opvulling rond de afbeelding in pixels (0 tot 256) |
| borderRadius | number | Nee | 12 | Hoekradius op de schermafbeelding (0 tot 64) |
| shadowPreset | string | Nee | `"subtle"` | Schaduw-preset: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | Nee | 20 | Aangepaste vervagingsstraal van de schaduw (0 tot 100, gebruikt wanneer `shadowPreset` `custom` is) |
| shadowOffsetX | number | Nee | 0 | Aangepaste horizontale verschuiving van de schaduw (-50 tot 50) |
| shadowOffsetY | number | Nee | 10 | Aangepaste verticale verschuiving van de schaduw (-50 tot 50) |
| shadowColor | string | Nee | `"#000000"` | Aangepaste schaduwkleur als hex |
| shadowOpacity | number | Nee | 30 | Aangepaste dekking van de schaduw (0 tot 100) |
| frame | string | Nee | `"none"` | Apparaat- of vensterframe: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | Nee | - | Titeltekst weergegeven in de titelbalken van vensterframes |
| socialPreset | string | Nee | `"none"` | Formaat aanpassen aan afmetingen voor social media: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | Nee | - | Optionele watermerktekst-overlay |
| watermarkPosition | string | Nee | `"bottom-right"` | Watermerkpositie: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | Nee | 50 | Watermerkdekking (0 tot 100) |
| outputFormat | string | Nee | `"png"` | Uitvoerformaat: `png`, `jpeg`, `webp` |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Met achtergrondafbeelding {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Opmerkingen {#notes}

- Accepteert twee bestandsvelden: `file` (vereist, de belangrijkste schermafbeelding) en `backgroundImage` (optioneel, gebruikt wanneer `backgroundType` `image` is).
- Ondersteunt de invoerformaten HEIC, RAW, PSD en SVG (automatisch gedecodeerd).
- Schaduw-presets komen overeen met specifieke waarden:
  - `subtle`: vervaging 20, offsetY 4, dekking 20%
  - `medium`: vervaging 40, offsetY 10, dekking 35%
  - `dramatic`: vervaging 80, offsetY 20, dekking 50%
- Presets voor social media passen het formaat van de uiteindelijke uitvoer aan de doelafmetingen aan met de modus `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Apparaatframes (`iphone`, `macbook`, `ipad`) plaatsen een hardwarerand rond de afbeelding en slaan de instelling `borderRadius` over.
- Wanneer transparantie is vereist (schaduw, hoekradius, apparaatframes of een transparante achtergrond), wordt de uitvoer geforceerd naar PNG, zelfs als `jpeg` is geselecteerd.
- Afbeeldingsachtergronden worden niet ondersteund in de pipeline-/batchmodus.
