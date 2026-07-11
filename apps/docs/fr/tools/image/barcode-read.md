---
description: "Analyse les images à la recherche de QR codes, de codes-barres et de codes 2D, avec une sortie annotée."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: bee76c077f68
---

# Lecteur de codes-barres {#barcode-reader}

Analyse les images téléversées à la recherche de tous types de codes-barres et de QR codes. Renvoie le texte décodé, le type de code-barres et les données de position pour chaque code détecté. Génère également une image annotée avec des cadres de délimitation colorés autour des codes détectés.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Accepte des données de formulaire multipart contenant un fichier image et un champ JSON `settings` facultatif.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | booléen | Non | `true` | Active un mode d'analyse agressif pour les codes-barres plus difficiles à lire (plus lent mais plus approfondi) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Exemple de réponse {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Champs de la réponse {#response-fields}

| Champ | Type | Description |
|-------|------|-------------|
| filename | chaîne | Nom de fichier d'origine |
| barcodes | tableau | Tableau des objets code-barres détectés |
| annotatedUrl | chaîne ou null | URL de téléchargement de l'image annotée (null si aucun code-barres n'est trouvé) |
| previewUrl | chaîne ou null | Identique à annotatedUrl (pour la compatibilité d'aperçu côté frontend) |

### Objet code-barres {#barcode-object}

| Champ | Type | Description |
|-------|------|-------------|
| type | chaîne | Format du code-barres (QRCode, EAN-13, Code128, DataMatrix, PDF417, etc.) |
| text | chaîne | Contenu décodé du code-barres |
| position | objet | Cadre de délimitation avec les coordonnées topLeft, topRight, bottomLeft, bottomRight |

## Types de codes-barres pris en charge {#supported-barcode-types}

Codes-barres 1D : Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

Codes-barres 2D : QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Remarques {#notes}

- Utilise la bibliothèque zxing-wasm pour la détection des codes-barres.
- L'image annotée superpose des cadres de délimitation polygonaux colorés et des étiquettes numérotées sur chaque code-barres détecté.
- Jusqu'à 255 codes-barres peuvent être détectés dans une même image.
- Si aucun code-barres n'est trouvé, `barcodes` est un tableau vide et `annotatedUrl` vaut null.
- Le mode `tryHarder` effectue une analyse plus approfondie au prix d'un temps de traitement plus long. Désactivez-le pour un traitement plus rapide des codes-barres nets et bien alignés.
- La sortie annotée est toujours au format PNG.
- Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant l'analyse.
- L'orientation EXIF est appliquée automatiquement avant le traitement.
