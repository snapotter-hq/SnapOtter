---
description: "Réduisez la taille du fichier image par niveau de qualité ou vers une taille de fichier cible."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: 2b5f8ab95198
---

# Compresser une image {#compress}

Réduisez la taille du fichier image en spécifiant un niveau de qualité ou une taille de fichier cible en kilo-octets. L'outil utilise une recherche binaire itérative pour atteindre précisément les cibles de taille.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compress`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Non | `"quality"` | Mode de compression : `quality` ou `targetSize` |
| quality | number | Non | `80` | Niveau de qualité (1-100). Utilisé lorsque mode vaut `quality`. |
| targetSizeKb | number | Non | - | Taille de fichier cible en kilo-octets. Utilisée lorsque mode vaut `targetSize`. |

## Example Request {#example-request}

Compresser à la qualité 60 :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Compresser vers une taille cible de 200 Ko :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notes {#notes}

- En mode `quality`, les valeurs plus basses produisent des fichiers plus petits avec davantage d'artefacts de compression. Une valeur de 80 est une bonne valeur par défaut pour le web.
- En mode `targetSize`, le moteur effectue une compression itérative pour se rapprocher le plus possible de la cible sans la dépasser.
- Le format de sortie correspond au format d'entrée. La compression s'applique à l'encodage natif du format (par ex. qualité JPEG pour les fichiers JPEG, qualité WebP pour les fichiers WebP).
- Si la qualité par défaut (80) convient, vous pouvez omettre entièrement le paramètre `quality`.
