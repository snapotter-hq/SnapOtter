---
description: "Superposez des images avec position, opacité et modes de fusion pour la composition."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 922e2da126f7
---

# Composition d'images {#image-composition}

Superposez une image de recouvrement au-dessus d'une image de base avec une position, une opacité et un mode de fusion configurables. Utile pour composer des logos, des graphiques ou combiner plusieurs images.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compose`

Accepte des données de formulaire multipart avec **deux** fichiers image et un champ JSON `settings`.

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| x | number | Non | `0` | Décalage horizontal du recouvrement par rapport au coin supérieur gauche en pixels (min 0) |
| y | number | Non | `0` | Décalage vertical du recouvrement par rapport au coin supérieur gauche en pixels (min 0) |
| opacity | number | Non | `100` | Pourcentage d'opacité du recouvrement (0 à 100) |
| blendMode | string | Non | `"over"` | Mode de fusion de composition |

### Blend Modes {#blend-modes}

| Valeur | Description |
|-------|-------------|
| `over` | Recouvrement normal (par défaut) |
| `multiply` | Assombrit en multipliant les valeurs des pixels |
| `screen` | Éclaircit en inversant, multipliant, puis inversant à nouveau |
| `overlay` | Combine multiply et screen selon la luminosité de la base |
| `darken` | Conserve le pixel le plus sombre de chaque calque |
| `lighten` | Conserve le pixel le plus clair de chaque calque |
| `hard-light` | Recouvrement à fort contraste |
| `soft-light` | Recouvrement à contraste subtil |
| `difference` | Différence absolue entre les calques |
| `exclusion` | Similaire à difference mais avec un contraste plus faible |

### File Fields {#file-fields}

| Nom du champ | Requis | Description |
|------------|----------|-------------|
| file | Oui | L'image de base/d'arrière-plan |
| overlay | Oui | L'image de recouvrement/de premier plan |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Avec le mode de fusion multiply :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notes {#notes}

- Les deux images sont validées et décodées (HEIC, RAW, PSD, SVG pris en charge) avant la composition.
- Le recouvrement est placé aux coordonnées exactes en pixels spécifiées par `x` et `y`. Il n'est pas redimensionné pour s'ajuster.
- Si l'opacité est inférieure à 100, un masque alpha est appliqué au recouvrement avant la fusion.
- Le recouvrement peut dépasser les limites de l'image de base (il sera rogné).
- L'orientation EXIF est appliquée automatiquement sur les deux images avant le traitement.
- Les dimensions de sortie correspondent aux dimensions de l'image de base.
