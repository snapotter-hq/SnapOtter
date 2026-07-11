---
description: "Appliquez un effet de pixellisation à l'image entière ou à une région spécifique."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 320a82696179
---

# Pixelliser {#pixelate}

Appliquez un effet de pixellisation à une image entière ou à une région rectangulaire spécifique. Utile pour masquer du contenu sensible comme des visages, des plaques d'immatriculation ou des informations personnelles.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| blockSize | integer | Non | `12` | Taille des blocs de pixels (2-128) ; des valeurs plus élevées produisent une pixellisation plus grossière |
| region | object | Non | - | Restreindre la pixellisation à un rectangle (voir ci-dessous) |

### Objet région {#region-object}

| Champ | Type | Requis | Description |
|-------|------|----------|-------------|
| left | integer | Oui | Décalage à gauche en pixels (>= 0) |
| top | integer | Oui | Décalage en haut en pixels (>= 0) |
| width | integer | Oui | Largeur de la région en pixels (>= 1) |
| height | integer | Oui | Hauteur de la région en pixels (>= 1) |

## Exemple de requête {#example-request}

Pixelliser l'image entière :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pixelliser une région spécifique :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Remarques {#notes}

- Lorsque `region` est omis, l'image entière est pixellisée.
- Les coordonnées de la région sont exprimées en pixels par rapport au coin supérieur gauche de l'image. La région doit se situer à l'intérieur des limites de l'image.
- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
