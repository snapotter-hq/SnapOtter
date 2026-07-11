---
description: "Transforme de simples captures d'écran en images soignées avec arrière-plans en dégradé, cadres d'appareils, ombres et formats pour réseaux sociaux."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 06a0128238ad
---

# Embellir une capture d'écran {#beautify-screenshot}

Ajoute des arrière-plans en dégradé, des cadres d'appareils, des ombres, des filigranes et des formats pour réseaux sociaux à vos captures d'écran. Idéal pour créer des images soignées destinées au marketing produit, aux réseaux sociaux et à la documentation.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | chaîne | Non | `"linear-gradient"` | Type d'arrière-plan : `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | chaîne | Non | `"#667eea"` | Couleur d'arrière-plan unie (utilisée lorsque `backgroundType` vaut `solid`) |
| gradientStops | tableau | Non | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Points d'arrêt du dégradé (min 2). Chaque point a un `color` (hex) et une `position` (0 à 100). |
| gradientAngle | nombre | Non | 135 | Angle du dégradé en degrés (0 à 360) |
| padding | nombre | Non | 64 | Marge autour de l'image en pixels (0 à 256) |
| borderRadius | nombre | Non | 12 | Rayon des coins de la capture (0 à 64) |
| shadowPreset | chaîne | Non | `"subtle"` | Préréglage d'ombre : `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | nombre | Non | 20 | Rayon de flou d'ombre personnalisé (0 à 100, utilisé lorsque `shadowPreset` vaut `custom`) |
| shadowOffsetX | nombre | Non | 0 | Décalage horizontal d'ombre personnalisé (-50 à 50) |
| shadowOffsetY | nombre | Non | 10 | Décalage vertical d'ombre personnalisé (-50 à 50) |
| shadowColor | chaîne | Non | `"#000000"` | Couleur d'ombre personnalisée en hex |
| shadowOpacity | nombre | Non | 30 | Opacité d'ombre personnalisée (0 à 100) |
| frame | chaîne | Non | `"none"` | Cadre d'appareil ou de fenêtre : `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | chaîne | Non | - | Texte de titre affiché dans les barres de titre des fenêtres |
| socialPreset | chaîne | Non | `"none"` | Redimensionne aux dimensions des réseaux sociaux : `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | chaîne | Non | - | Texte de filigrane facultatif à superposer |
| watermarkPosition | chaîne | Non | `"bottom-right"` | Position du filigrane : `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | nombre | Non | 50 | Opacité du filigrane (0 à 100) |
| outputFormat | chaîne | Non | `"png"` | Format de sortie : `png`, `jpeg`, `webp` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Avec image d'arrière-plan {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Remarques {#notes}

- Accepte deux champs de fichier : `file` (requis, la capture d'écran principale) et `backgroundImage` (facultatif, utilisé lorsque `backgroundType` vaut `image`).
- Prend en charge les formats d'entrée HEIC, RAW, PSD et SVG (décodés automatiquement).
- Les préréglages d'ombre correspondent à des valeurs précises :
  - `subtle` : flou 20, offsetY 4, opacité 20 %
  - `medium` : flou 40, offsetY 10, opacité 35 %
  - `dramatic` : flou 80, offsetY 20, opacité 50 %
- Les préréglages pour réseaux sociaux redimensionnent la sortie finale aux dimensions cibles en mode `contain` :
  - `twitter` : 1600x900
  - `linkedin` : 1200x627
  - `instagram-square` : 1080x1080
  - `instagram-story` : 1080x1920
  - `facebook` : 1200x630
  - `producthunt` : 1270x760
- Les cadres d'appareils (`iphone`, `macbook`, `ipad`) appliquent une bordure matérielle autour de l'image et ignorent le réglage `borderRadius`.
- Lorsque la transparence est requise (ombre, rayon des coins, cadres d'appareils ou arrière-plan transparent), la sortie est forcée en PNG même si `jpeg` est sélectionné.
- Les images d'arrière-plan ne sont pas prises en charge en mode pipeline/batch.
