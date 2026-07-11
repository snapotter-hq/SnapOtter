---
description: "Ajoute un effet de vignettage avec une force, une couleur et une position réglables."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 1b6d502016c9
---

# Vignettage {#vignette}

Ajoute un effet de vignettage qui assombrit ou teinte les bords d'une image. Prend en charge une force, une couleur, un rayon, une douceur, une rondeur et une position centrale réglables.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| strength | number | Non | `0.5` | Opacité du vignettage (0,1-1) |
| color | string | Non | `"#000000"` | Couleur hexadécimale du vignettage |
| radius | integer | Non | `70` | Rayon extérieur en pourcentage de la demi-diagonale (0-100) |
| softness | integer | Non | `50` | Douceur du dégradé (0-100) ; des valeurs plus élevées produisent un fondu plus progressif |
| roundness | integer | Non | `100` | Forme : 100 = cercle, 0 = ellipse correspondant au rapport d'aspect de l'image |
| centerX | integer | Non | `50` | Position horizontale du centre en pourcentage (0-100) |
| centerY | integer | Non | `50` | Position verticale du centre en pourcentage (0-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Remarques {#notes}

- Un `radius` plus petit assombrit une plus grande partie de l'image ; un rayon plus grand confine le vignettage aux bords extrêmes.
- Utilisez une `color` non noire (par exemple des tons blancs ou sépia) pour des effets de vignettage créatifs.
- Ajuster `centerX` et `centerY` permet de positionner la zone claire hors du centre, ce qui est utile pour attirer l'attention sur un sujet qui ne se trouve pas au milieu du cadre.
- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
