---
description: "Ajoute des bordures, des marges, des coins arrondis et des ombres portées aux images dans un ordre prévisible et contrôlable."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: ac03317786ec
---

# Bordure et cadre {#border-frame}

Ajoute des bordures, des marges, des coins arrondis et des ombres portées aux images. L'outil applique les effets dans l'ordre suivant : marge, bordure, rayon des coins, puis ombre.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/border`

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | nombre | Non | 10 | Épaisseur de la bordure en pixels (0 à 2000) |
| borderColor | chaîne | Non | `"#000000"` | Couleur de la bordure en hex (par exemple `#FF0000`) |
| padding | nombre | Non | 0 | Marge intérieure entre l'image et la bordure en pixels (0 à 200) |
| paddingColor | chaîne | Non | `"#FFFFFF"` | Couleur de remplissage de la marge en hex |
| cornerRadius | nombre | Non | 0 | Rayon des coins en pixels (0 à 2000) |
| shadow | booléen | Non | `false` | Indique s'il faut ajouter une ombre portée |
| shadowBlur | nombre | Non | 15 | Rayon de flou de l'ombre (1 à 200) |
| shadowOffsetX | nombre | Non | 0 | Décalage horizontal de l'ombre (-50 à 50) |
| shadowOffsetY | nombre | Non | 5 | Décalage vertical de l'ombre (-50 à 50) |
| shadowColor | chaîne | Non | `"#000000"` | Couleur de l'ombre en hex |
| shadowOpacity | nombre | Non | 40 | Pourcentage d'opacité de l'ombre (0 à 100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Remarques {#notes}

- Utilise la fabrique standard `createToolRoute`. Accepte un seul fichier image via un téléversement multipart.
- Prend en charge les formats d'entrée HEIC, RAW, PSD et SVG (décodés automatiquement).
- Ordre de traitement : la marge est ajoutée en premier, puis la bordure l'entoure, puis le rayon des coins est appliqué, puis l'ombre est composée.
- Lorsque `cornerRadius` ou `shadow` est activé, la sortie est forcée en PNG (quel que soit le format d'entrée) afin de préserver la transparence. Les formats prenant en charge la couche alpha (PNG, WebP, AVIF) conservent leur format d'origine.
- L'ombre tient compte de la forme : elle suit les coins arrondis au lieu de créer une ombre rectangulaire.
- Régler `borderWidth` sur 0 en n'utilisant que `cornerRadius` + `shadow` crée un effet d'ombre arrondie sans cadre.
