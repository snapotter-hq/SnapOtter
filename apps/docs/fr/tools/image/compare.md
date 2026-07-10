---
description: "Comparez deux images côte à côte avec une visualisation des différences au niveau du pixel et un score de similarité."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: fc7fc59014a7
---

# Comparaison d'images {#image-compare}

Téléversez deux images pour calculer une carte des différences au niveau du pixel et un pourcentage de similarité numérique. La sortie est une image de différence mettant en évidence les régions modifiées en rouge.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compare`

Accepte des données de formulaire multipart avec **deux** fichiers image. Aucun champ de réglages n'est nécessaire.

## Parameters {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez exactement deux fichiers image.

| Champ | Type | Requis | Description |
|-------|------|----------|-------------|
| file (premier) | file | Oui | La première image |
| file (second) | file | Oui | La deuxième image |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Response Fields {#response-fields}

| Champ | Type | Description |
|-------|------|-------------|
| jobId | string | Identifiant de tâche pour télécharger l'image de différence |
| similarity | number | Pourcentage de similarité entre les deux images (0 à 100) |
| dimensions | object | Largeur et hauteur utilisées pour la comparaison |
| downloadUrl | string | URL pour télécharger l'image de différence générée |
| originalSize | number | Taille combinée des deux images d'entrée en octets |
| processedSize | number | Taille de l'image de différence en sortie en octets |

## Notes {#notes}

- Les deux images sont redimensionnées aux mêmes dimensions (le maximum de chaque axe) avant la comparaison.
- L'image de différence met en évidence les écarts en rouge avec une opacité proportionnelle à l'ampleur du changement. Les pixels identiques ou quasi identiques (différence < 10) sont affichés sous forme de versions semi-transparentes de l'original.
- La similarité est calculée comme l'inverse de la différence moyenne des pixels sur l'ensemble des pixels, exprimée en pourcentage.
- Une similarité de 100 % signifie que les images sont identiques au pixel près (à la résolution de comparaison).
- La sortie de différence est toujours au format PNG, quels que soient les formats d'entrée.
- Les deux images sont validées et décodées (HEIC, RAW, PSD, SVG pris en charge) avant la comparaison.
- L'orientation EXIF est appliquée automatiquement sur les deux images avant le traitement.
