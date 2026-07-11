---
description: "Appliquez un effet duotone à deux couleurs avec des couleurs d'ombre et de haute lumière personnalisées."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 64565f77870a
---

# Duotone {#duotone}

Appliquez un effet duotone à deux couleurs à une image. L'image est convertie en niveaux de gris, puis mappée sur un dégradé entre la couleur d'ombre (tons sombres) et la couleur de haute lumière (tons clairs).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| shadow | string | Non | `"#1e3a8a"` | Couleur hexadécimale d'ombre (appliquée aux tons sombres) |
| highlight | string | Non | `"#fbbf24"` | Couleur hexadécimale de haute lumière (appliquée aux tons clairs) |
| intensity | integer | Non | `100` | Intensité de l'effet (0-100) ; 0 renvoie l'original, 100 applique le duotone complet |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notes {#notes}

- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont décodées automatiquement avant le traitement.
- Une `intensity` inférieure à 100 mélange le résultat duotone avec l'image d'origine, permettant des effets plus subtils.
- Les combinaisons duotone populaires incluent bleu marine/or, sarcelle/corail et violet/rose.
