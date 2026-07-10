---
description: "Génère des codes-barres aux formats Code 128, EAN-13, UPC-A, Code 39, ITF-14 et Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 24b390066428
---

# Générateur de codes-barres {#barcode-generator}

Génère des images de codes-barres à partir d'un texte saisi. Prend en charge les formats Code 128, EAN-13, UPC-A, Code 39, ITF-14 et Data Matrix.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Accepte un corps `application/json` (et non multipart). Le code-barres est généré à partir du texte fourni, pas d'un fichier téléversé.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| text | chaîne | Oui | - | Texte à encoder dans le code-barres (1 à 256 caractères) |
| type | chaîne | Non | `"code128"` | Format du code-barres : `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | entier | Non | `3` | Facteur d'échelle de l'image (1 à 8) |
| includeText | booléen | Non | `true` | Indique si le texte doit être affiché sous le code-barres |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Remarques {#notes}

- Contrairement à la plupart des outils, ce point de terminaison accepte un corps JSON, et non des données de formulaire multipart, puisque les codes-barres sont générés à partir d'un texte plutôt que d'un fichier téléversé.
- EAN-13 exige exactement 12 ou 13 chiffres. UPC-A exige exactement 11 ou 12 chiffres. Si le chiffre de contrôle est omis, il est calculé automatiquement.
- Code 128 est le format le plus souple et prend en charge l'ensemble du jeu de caractères ASCII.
- Data Matrix produit un code-barres 2D adapté à l'encodage de chaînes plus longues dans un carré compact.
