---
description: "Förvandla vanliga skärmbilder till polerade bilder med gradientbakgrunder, enhetsramar, skuggor och storleksanpassning för sociala medier."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 30f7d2c6cc18
---

# Försköna skärmbild {#beautify-screenshot}

Lägg till gradientbakgrunder, enhetsramar, skuggor, vattenstämplar och storleksanpassning för sociala medier till skärmbilder. Idealiskt för att skapa polerade bilder för produktmarknadsföring, sociala medier och dokumentation.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| backgroundType | sträng | Nej | `"linear-gradient"` | Bakgrundstyp: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | sträng | Nej | `"#667eea"` | Enfärgad bakgrundsfärg (används när `backgroundType` är `solid`) |
| gradientStops | array | Nej | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Gradientens färgstopp (minst 2). Varje stopp har `color` (hex) och `position` (0-100). |
| gradientAngle | tal | Nej | 135 | Gradientvinkel i grader (0 till 360) |
| padding | tal | Nej | 64 | Utfyllnad runt bilden i pixlar (0 till 256) |
| borderRadius | tal | Nej | 12 | Hörnradie på skärmbilden (0 till 64) |
| shadowPreset | sträng | Nej | `"subtle"` | Skuggförinställning: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | tal | Nej | 20 | Anpassad radie för skuggoskärpa (0 till 100, används när `shadowPreset` är `custom`) |
| shadowOffsetX | tal | Nej | 0 | Anpassad horisontell skuggförskjutning (-50 till 50) |
| shadowOffsetY | tal | Nej | 10 | Anpassad vertikal skuggförskjutning (-50 till 50) |
| shadowColor | sträng | Nej | `"#000000"` | Anpassad skuggfärg i hex |
| shadowOpacity | tal | Nej | 30 | Anpassad skuggopacitet (0 till 100) |
| frame | sträng | Nej | `"none"` | Enhets- eller fönsterram: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | sträng | Nej | - | Titeltext som visas i namnlisten på fönsterramar |
| socialPreset | sträng | Nej | `"none"` | Storleksanpassa till dimensioner för sociala medier: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | sträng | Nej | - | Valfri vattenstämpeltext som överlägg |
| watermarkPosition | sträng | Nej | `"bottom-right"` | Vattenstämpelns position: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | tal | Nej | 50 | Vattenstämpelns opacitet (0 till 100) |
| outputFormat | sträng | Nej | `"png"` | Utdataformat: `png`, `jpeg`, `webp` |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Med bakgrundsbild {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Anteckningar {#notes}

- Tar emot två filfält: `file` (obligatoriskt, den huvudsakliga skärmbilden) och `backgroundImage` (valfritt, används när `backgroundType` är `image`).
- Stöder indataformaten HEIC, RAW, PSD och SVG (avkodas automatiskt).
- Skuggförinställningarna mappas till specifika värden:
  - `subtle`: oskärpa 20, offsetY 4, opacitet 20 %
  - `medium`: oskärpa 40, offsetY 10, opacitet 35 %
  - `dramatic`: oskärpa 80, offsetY 20, opacitet 50 %
- Förinställningar för sociala medier storleksanpassar den slutliga utdata så att den passar målmåtten med läget `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Enhetsramar (`iphone`, `macbook`, `ipad`) lägger en hårdvaruram runt bilden och hoppar över inställningen `borderRadius`.
- När transparens krävs (skugga, hörnradie, enhetsramar eller transparent bakgrund) tvingas utdata till PNG även om `jpeg` är valt.
- Bildbakgrunder stöds inte i pipeline-/batchläge.
