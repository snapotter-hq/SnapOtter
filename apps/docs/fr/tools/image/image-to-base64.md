---
description: "Convertissez des images en URI de données base64 pour les intégrer dans du HTML, du CSS, et plus."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 7b916b14cc67
---

# Image vers Base64 {#image-to-base64}

Convertissez une ou plusieurs images en chaînes encodées en base64 et en URI de données. Prend en charge la conversion de format facultative, le contrôle de la qualité et le redimensionnement. Utile pour intégrer des images directement dans du HTML, du CSS, du JSON ou des modèles d'e-mail.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Accepte des données de formulaire multipart avec une ou plusieurs images et un champ JSON `settings` facultatif.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Non | `"original"` | Convertir avant l'encodage : `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Non | `80` | Qualité de sortie pour les formats avec perte (1 à 100) |
| maxWidth | number | Non | `0` | Largeur maximale en pixels (0 = pas de redimensionnement, n'agrandira pas) |
| maxHeight | number | Non | `0` | Hauteur maximale en pixels (0 = pas de redimensionnement, n'agrandira pas) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Plusieurs fichiers :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Exemple de réponse {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Champs de réponse {#response-fields}

| Champ | Type | Description |
|-------|------|-------------|
| results | array | Images converties avec succès |
| errors | array | Images qui n'ont pas pu être traitées (avec nom de fichier et message d'erreur) |

### Objet Result {#result-object}

| Champ | Type | Description |
|-------|------|-------------|
| filename | string | Nom de fichier d'origine |
| mimeType | string | Type MIME de la sortie encodée |
| width | number | Largeur finale en pixels (après tout redimensionnement) |
| height | number | Hauteur finale en pixels (après tout redimensionnement) |
| originalSize | number | Taille du fichier d'origine en octets |
| encodedSize | number | Taille de la chaîne base64 en octets |
| overheadPercent | number | Pourcentage de différence de taille par rapport à l'original (positif = plus grand, négatif = plus petit) |
| base64 | string | Données d'image brutes encodées en base64 |
| dataUri | string | URI de données complet prêt à l'emploi dans les attributs `src` |

## Notes {#notes}

- L'encodage base64 augmente généralement la taille d'environ 33 % par rapport au fichier binaire. Le champ `overheadPercent` indique la différence réelle.
- Lorsque `outputFormat` vaut `"original"`, les fichiers HEIC/HEIF sont convertis en JPEG (car les navigateurs ne peuvent pas afficher le HEIC dans les URI de données).
- Les options `maxWidth` et `maxHeight` redimensionnent en utilisant `fit: inside` avec `withoutEnlargement`, de sorte que les images plus petites que les dimensions spécifiées ne sont pas agrandies.
- Plusieurs fichiers peuvent être traités en une seule requête. Chaque fichier est traité indépendamment, et les échecs n'empêchent pas les autres fichiers de réussir.
- Les fichiers SVG sont transmis tels quels en `image/svg+xml` sans réencodage (sauf si une conversion de format est demandée).
- Il s'agit d'un point de terminaison en lecture seule. Il ne produit pas de fichier téléchargeable ni de `jobId`. Les données base64 sont renvoyées directement dans le corps de la réponse.
