---
description: "Simulez la façon dont les images apparaissent aux personnes atteintes de différents types de déficience de la vision des couleurs."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 52b619669212
---

# Simulation du daltonisme {#color-blindness-simulation}

Simulez la déficience de la vision des couleurs (CVD) pour prévisualiser comment les images apparaissent aux personnes atteintes de divers types de daltonisme. Utile pour tester l'accessibilité des designs, graphiques et interfaces utilisateur.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| simulationType | string | Non | `"deuteranomaly"` | Type de déficience de la vision des couleurs à simuler |

### Simulation Types {#simulation-types}

| Valeur | Condition | Description |
|-------|-----------|-------------|
| `protanopia` | Insensibilité au rouge | Absence totale de cônes sensibles au rouge |
| `deuteranopia` | Insensibilité au vert | Absence totale de cônes sensibles au vert |
| `tritanopia` | Insensibilité au bleu | Absence totale de cônes sensibles au bleu |
| `protanomaly` | Faible sensibilité au rouge | Sensibilité réduite des cônes rouges |
| `deuteranomaly` | Faible sensibilité au vert | Sensibilité réduite des cônes verts (la plus courante) |
| `tritanomaly` | Faible sensibilité au bleu | Sensibilité réduite des cônes bleus |
| `achromatopsia` | Daltonisme total | Absence totale de vision des couleurs |
| `blueConeMonochromacy` | Cônes bleus uniquement | Seuls les cônes bleus sont fonctionnels |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notes {#notes}

- La deutéranomalie (faible sensibilité au vert) est la valeur par défaut car il s'agit de la forme la plus courante de déficience de la vision des couleurs, touchant environ 6 % des hommes.
- La simulation utilise des matrices de transformation des couleurs qui modélisent la manière dont des photorécepteurs à cônes réduits ou absents altèrent les couleurs perçues.
- Cet outil est non destructif et ne produit qu'un aperçu. Il ne modifie pas l'image d'origine pour l'accessibilité.
- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont décodées automatiquement avant le traitement.
