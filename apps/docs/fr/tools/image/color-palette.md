---
description: "Extrayez les couleurs dominantes d'une image sous forme de palette de couleurs."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: f67352cb8882
---

# Palette de couleurs {#color-palette}

Extrayez les couleurs dominantes d'une image et renvoyez-les sous forme de valeurs hexadécimales. Utilise une analyse de fréquence quantifiée pour identifier les couleurs les plus marquantes et visuellement distinctes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings` optionnel.

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| count | integer | Non | `8` | Nombre de couleurs à extraire (2-16) |
| format | string | Non | `"hex"` | Format de couleur : `hex`, `rgb`, `hsl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Example Response {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Response Fields {#response-fields}

| Champ | Type | Description |
|-------|------|-------------|
| filename | string | Nom de fichier assaini |
| colors | array | Tableau de chaînes de couleurs dans le format demandé, ordonné par dominance (la plus fréquente en premier) |
| hex | array | Tableau de chaînes de couleurs hexadécimales (toujours en hexadécimal, quel que soit le réglage `format`) |
| count | number | Nombre de couleurs extraites |

## Notes {#notes}

- Renvoie jusqu'à `count` couleurs dominantes (8 par défaut, plage 2-16), triées par fréquence (la plus courante en premier).
- L'image est redimensionnée en interne à 100x100 pixels pour l'analyse, de sorte que la palette représente la distribution globale des couleurs plutôt que de petits détails.
- Les couleurs sont extraites à l'aide de la quantification par coupe médiane, qui divise récursivement les populations de pixels le long du canal ayant la plus large plage.
- Le canal alpha est supprimé avant l'analyse, donc les zones transparentes ne sont pas prises en compte.
- Il s'agit d'un point de terminaison en lecture seule. Il ne produit pas de fichier de sortie téléchargeable ni de `jobId`.
- Les entrées HEIC, RAW, PSD et SVG sont décodées automatiquement avant l'analyse.
