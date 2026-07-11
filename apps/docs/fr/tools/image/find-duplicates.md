---
description: "Détectez les images en double et quasi-doublons à l'aide du hachage perceptuel."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: a6b93b7c5eeb
---

# Rechercher les doublons {#find-duplicates}

Téléversez plusieurs images pour détecter les doublons et quasi-doublons à l'aide du hachage perceptuel (dHash). Regroupe les images similaires, identifie la version de meilleure qualité dans chaque groupe et calcule les économies d'espace potentielles.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Accepte des données de formulaire multipart avec plusieurs images et un champ JSON `settings` facultatif.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| threshold | number | Non | `8` | Distance de Hamming maximale pour considérer des images comme des doublons (0 à 20). Plus bas = correspondance plus stricte |

### Champs de fichier {#file-fields}

Téléversez au moins 2 images dans la requête multipart (toutes avec le nom de champ `file` ou n'importe quel nom de champ pour les parties de fichier).

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Exemple de réponse {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Champs de réponse {#response-fields}

| Champ | Type | Description |
|-------|------|-------------|
| totalImages | number | Nombre d'images analysées avec succès |
| duplicateGroups | array | Groupes d'images en double |
| uniqueImages | number | Nombre d'images ne faisant partie d'aucun groupe de doublons |
| spaceSaveable | number | Total d'octets pouvant être économisés en supprimant les doublons non optimaux |
| skippedFiles | array | Fichiers qui n'ont pas pu être traités (avec nom de fichier et raison) |

### Objet de groupe de doublons {#duplicate-group-object}

| Champ | Type | Description |
|-------|------|-------------|
| groupId | number | Identifiant du groupe |
| files | array | Images de ce groupe de doublons |

### Objet de fichier (au sein d'un groupe) {#file-object-within-a-group}

| Champ | Type | Description |
|-------|------|-------------|
| filename | string | Nom de fichier d'origine |
| similarity | number | Pourcentage de similarité avec l'image de référence (première du groupe) |
| width | number | Largeur de l'image en pixels |
| height | number | Hauteur de l'image en pixels |
| fileSize | number | Taille du fichier en octets |
| format | string | Format de l'image |
| isBest | boolean | Indique s'il s'agit de la version de meilleure qualité (le plus de pixels, le plus gros fichier) |
| thumbnail | string ou null | Miniature JPEG en Base64 (200 px de large) pour l'aperçu |

## Notes {#notes}

- Utilise un dHash de 128 bits (64 bits en ligne + 64 bits en colonne) pour la détection de similarité perceptuelle. Cela détecte les doublons même à travers les redimensionnements, la recompression et les modifications mineures.
- Le seuil représente la distance de Hamming maximale entre les hachages. La valeur par défaut de 8 détecte les quasi-doublons tout en évitant les faux positifs. Utilisez 0 pour une correspondance strictement identique au pixel près, ou 15-20 pour une correspondance très souple.
- La « meilleure » image de chaque groupe est celle qui a le plus de pixels (largeur x hauteur), la taille du fichier servant de critère de départage.
- Au moins 2 images sont requises. Les fichiers qui échouent à la validation ou au décodage sont signalés dans `skippedFiles` plutôt que de faire échouer l'ensemble de la requête.
- Les miniatures sont des aperçus JPEG de 200 px de large encodés en URI de données.
- Tous les formats courants sont pris en charge (HEIC, RAW, PSD, SVG décodés automatiquement).
