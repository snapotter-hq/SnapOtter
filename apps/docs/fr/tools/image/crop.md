---
description: "Recadrez les images en spécifiant une région avec position et dimensions."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: e9310ed8f439
---

# Recadrer une image {#crop}

Recadrez les images en définissant une région rectangulaire à l'aide d'une position et d'une taille. Prend en charge les unités en pixels et en pourcentage.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/crop`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| left | number | Oui | - | Décalage X de la région de recadrage (depuis le bord gauche) |
| top | number | Oui | - | Décalage Y de la région de recadrage (depuis le bord supérieur) |
| width | number | Oui | - | Largeur de la région de recadrage |
| height | number | Oui | - | Hauteur de la région de recadrage |
| unit | string | Non | `"px"` | Unité des valeurs : `px` ou `percent` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Recadrer en utilisant des valeurs en pourcentage :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- La région de recadrage doit tenir dans les limites de l'image. Si la région dépasse l'image, la requête échouera.
- Lors de l'utilisation de l'unité `percent`, les valeurs représentent des pourcentages des dimensions de l'image (par ex. `left: 10` signifie 10 % depuis le bord gauche).
- Le format de sortie correspond au format d'entrée.
- L'orientation EXIF est appliquée automatiquement avant le recadrage, de sorte que les coordonnées correspondent à l'orientation visuellement correcte.
