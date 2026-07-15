---
description: "Faites pivoter les images de n'importe quel angle et retournez-les horizontalement ou verticalement."
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: 05069a24e70c
---

# Rotation et miroir d'image {#rotate-flip}

Faites pivoter les images d'un angle arbitraire et/ou retournez-les horizontalement ou verticalement. Les opérations de rotation et de retournement peuvent être combinées dans une seule requête.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| angle | number | Non | `0` | Angle de rotation en degrés (sens horaire). Accepte toute valeur numérique. |
| horizontal | boolean | Non | `false` | Retourner l'image horizontalement (miroir) |
| vertical | boolean | Non | `false` | Retourner l'image verticalement |

## Exemple de requête {#example-request}

Pivoter de 90 degrés dans le sens horaire :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Retourner horizontalement :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Pivoter et retourner en même temps :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Remarques {#notes}

- La rotation est appliquée en premier, puis les opérations de retournement.
- Les rotations non multiples de 90 degrés (par exemple 45 degrés) agrandissent le canevas pour contenir l'image pivotée, avec un remplissage transparent ou noir selon le format de sortie.
- Valeurs courantes : 90, 180, 270 pour les rotations d'un quart de tour.
- L'orientation EXIF est appliquée automatiquement avant le traitement, de sorte que la rotation est relative à l'orientation visuelle.
