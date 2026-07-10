---
description: "Consultez les métadonnées détaillées d'une image, ses propriétés et les statistiques d'histogramme par canal."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: 42de10b6c38d
---

# Infos image {#image-info}

Outil d'analyse en lecture seule qui renvoie des métadonnées d'image complètes, dont les dimensions, le format, l'espace colorimétrique, la présence d'EXIF/ICC/XMP, et les statistiques d'histogramme par canal. Ne produit pas de fichier de sortie traité.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/info`

Accepte des données de formulaire multipart avec une image. Aucun champ de réglages n'est nécessaire.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Il suffit de téléverser l'image.

| Champ | Type | Requis | Description |
|-------|------|----------|-------------|
| file | file | Oui | L'image à analyser |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Exemple de réponse {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Champs de réponse {#response-fields}

| Champ | Type | Description |
|-------|------|-------------|
| filename | string | Nom de fichier assaini |
| fileSize | number | Taille du fichier en octets |
| width | number | Largeur de l'image en pixels |
| height | number | Hauteur de l'image en pixels |
| format | string | Format détecté (jpeg, png, webp, etc.) |
| channels | number | Nombre de canaux de couleur |
| hasAlpha | boolean | Indique si l'image a un canal alpha |
| colorSpace | string | Espace colorimétrique (srgb, cmyk, etc.) |
| density | number ou null | Résolution DPI/PPI |
| isProgressive | boolean | Indique si le JPEG utilise un encodage progressif |
| orientation | number ou null | Valeur d'orientation EXIF (1-8) |
| hasProfile | boolean | Indique si un profil ICC est intégré |
| hasExif | boolean | Indique si des métadonnées EXIF sont présentes |
| hasIcc | boolean | Indique si un profil colorimétrique ICC est présent |
| hasXmp | boolean | Indique si des métadonnées XMP sont présentes |
| bitDepth | string ou null | Bits par échantillon |
| pages | number | Nombre de pages (pour les formats multi-pages comme TIFF, GIF) |
| histogram | array | Statistiques par canal (min, max, moyenne, écart type) |

## Notes {#notes}

- Il s'agit d'un point de terminaison en lecture seule. Il ne produit pas de fichier de sortie téléchargeable ni de `jobId`.
- Pour les images au format RAW (DNG, CR2, NEF, ARW, etc.), ExifTool est utilisé pour extraire les vraies dimensions du capteur et les indicateurs de métadonnées que Sharp ne peut pas lire directement.
- Les fichiers HEIC/HEIF sont décodés en PNG en interne pour extraire les statistiques de pixels, car Sharp ne peut pas décoder les pixels HEVC.
- L'histogramme fournit le min/max/moyenne/écart type par canal, pas une distribution complète à 256 classes.
- Le champ `density` reflète les métadonnées DPI intégrées, si présentes.
