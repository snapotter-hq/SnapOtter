---
description: "Redimensionnement par découpe de coutures qui ajoute ou retire des pixels le long des chemins de faible importance afin de préserver le contenu clé et les visages."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 827ec41ceed7
---

# Redimensionnement adapté au contenu {#content-aware-resize}

Redimensionnement par découpe de coutures qui retire ou ajoute intelligemment des pixels le long des chemins de moindre importance visuelle, préservant le contenu important et protégeant éventuellement les visages.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Traitement :** synchrone (renvoie le résultat directement)

**Bundle de modèle :** aucun requis pour le fonctionnement de base. La protection des visages utilise le bundle `face-detection` (200-300 Mo) si elle est activée.

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| width | number | Non | - | Largeur cible en pixels |
| height | number | Non | - | Hauteur cible en pixels |
| protectFaces | boolean | Non | `false` | Détecter et protéger les visages contre la suppression de coutures |
| blurRadius | number | Non | `4` | Rayon de flou de prétraitement pour le calcul d'énergie (0-20) |
| sobelThreshold | number | Non | `2` | Seuil de détection de contours Sobel (1-20). Les valeurs plus élevées rendent l'algorithme plus agressif |
| square | boolean | Non | `false` | Redimensionner en carré (utilise la plus petite dimension) |

Au moins l'un des paramètres `width`, `height` ou `square` doit être spécifié.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notes {#notes}

- Cette route personnalisée renvoie actuellement une réponse synchrone 200.
- Utilise la bibliothèque de découpe de coutures `caire` pour le redimensionnement adapté au contenu.
- Réduit uniquement les dimensions (retire des coutures). Ne peut pas agrandir une image au-delà de sa taille d'origine.
- L'option `protectFaces` utilise la détection de visages par IA pour marquer les régions des visages comme à haute énergie, empêchant les coutures de les traverser.
- `blurRadius` contrôle le lissage avant le calcul de la carte d'énergie. Les valeurs plus élevées rendent la carte d'énergie plus uniforme, ce qui peut aider avec les images bruitées.
- `sobelThreshold` influence l'agressivité de la détection des contours. Les valeurs plus basses préservent des contours plus subtils.
- La sortie est toujours au format PNG.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR par décodage automatique.
