---
description: "Générez des QR codes avec des couleurs personnalisées et des niveaux de correction d'erreur."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 7d087efc30b6
---

# Générateur de QR code {#qr-code-generator}

Générez des images de QR code à partir de texte ou d'URL, avec une taille, un niveau de correction d'erreur et des couleurs de premier plan/arrière-plan configurables.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Accepte un **corps JSON** (pas de multipart). Aucun envoi de fichier n'est nécessaire.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| text | string | Oui | - | Contenu à encoder dans le QR code (1 à 2000 caractères) |
| size | number | Non | `400` | Largeur/hauteur de l'image de sortie en pixels (100 à 10000) |
| errorCorrection | string | Non | `"M"` | Niveau de correction d'erreur : `L` (7 %), `M` (15 %), `Q` (25 %), `H` (30 %) |
| foreground | string | Non | `"#000000"` | Couleur de premier plan/module du QR code en hexadécimal (`#RRGGBB`) |
| background | string | Non | `"#FFFFFF"` | Couleur d'arrière-plan du QR code en hexadécimal (`#RRGGBB`) |
| logoDataUri | string | Non | - | Image de logo sous forme de data URI (`data:image/png;base64,...` ou `data:image/jpeg;base64,...`, max 700 Ko). Centrée sur le QR code à 22 % de sa taille. Force la correction d'erreur à `H` |

### Niveaux de correction d'erreur {#error-correction-levels}

| Niveau | Récupération | Cas d'usage |
|-------|----------|----------|
| `L` | ~7 % | Densité de données maximale |
| `M` | ~15 % | Équilibré (par défaut) |
| `Q` | ~25 % | Adapté aux codes imprimés |
| `H` | ~30 % | Idéal pour les codes avec logo superposé |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

QR code de marque avec des couleurs personnalisées :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Remarques {#notes}

- Ce point de terminaison accepte du JSON, pas des données de formulaire multipart, puisque aucun envoi d'image n'est nécessaire.
- La sortie est toujours une image PNG.
- Le nom du fichier de sortie est toujours `qrcode.png`.
- `originalSize` vaut toujours 0 puisque cet outil génère des images à partir de rien.
- Une zone de silence (marge) de 2 modules est incluse autour du QR code.
- La longueur maximale du texte est de 2000 caractères. La capacité réelle dépend du niveau de correction d'erreur et de l'encodage des caractères.
- Des niveaux de correction d'erreur plus élevés permettent au QR code de rester scannable même partiellement masqué, mais réduisent la capacité de données.
- Lorsqu'un `logoDataUri` est fourni, la correction d'erreur est automatiquement forcée à `H` (30 %) pour que le QR code reste scannable malgré le logo qui occulte le centre.
