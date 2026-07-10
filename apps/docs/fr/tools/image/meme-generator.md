---
description: "Créez des mèmes à partir de modèles ou d'images personnalisées, avec des zones de texte stylisées et des choix de police."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: cd8d1d013765
---

# Générateur de mèmes {#meme-generator}

Créez des mèmes à partir de modèles intégrés ou d'images personnalisées. Ajoutez du texte avec le style classique des mèmes (texte gras et contouré), plusieurs préréglages de disposition et des choix de police.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Accepte au choix :
- **Données de formulaire multipart** avec un fichier image et un champ JSON `settings` (mode image personnalisée)
- **Corps JSON** avec un `templateId` (mode modèle, aucun envoi de fichier nécessaire)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | Non | - | ID du modèle de mème intégré. S'il est fourni, aucun envoi d'image n'est nécessaire |
| textLayout | string | Non | `"top-bottom"` | Disposition des zones de texte : `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Non | `[]` | Tableau d'objets de zone de texte avec les champs `id` et `text` |
| fontFamily | string | Non | `"anton"` | Police : `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Non | auto | Taille de police en pixels (8 à 200). Calculée automatiquement si omise |
| textColor | string | Non | `"#ffffff"` | Couleur de remplissage du texte |
| strokeColor | string | Non | `"#000000"` | Couleur du contour du texte |
| textAlign | string | Non | `"center"` | Alignement du texte : `left`, `center`, `right` |
| allCaps | boolean | Non | `true` | Convertir le texte en majuscules |

### Zones de texte {#text-boxes}

Chaque entrée du tableau `textBoxes` doit comporter :

| Champ | Type | Description |
|-------|------|-------------|
| id | string | Identifiant de zone correspondant à la disposition (par exemple `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Le texte du mème à afficher |

### ID de zones par disposition de texte {#text-layout-box-ids}

| Disposition | ID de zones disponibles |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Exemple de requête {#example-request}

Image personnalisée avec texte en haut et en bas :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Utilisation d'un modèle intégré (corps JSON, aucun envoi de fichier) :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Remarques {#notes}

- Soit un `templateId`, soit un fichier image envoyé est requis. Si les deux sont fournis, le modèle est utilisé.
- Les modèles définissent leurs propres positions de zones de texte ; le paramètre `textLayout` est ignoré lors de l'utilisation d'un modèle.
- Le texte est rendu en SVG avec des contours pour obtenir le look classique des mèmes.
- La taille de police est calculée automatiquement pour s'adapter à la zone de texte si elle n'est pas définie explicitement.
- Les zones de texte vides sont ignorées (aucun rendu n'a lieu si toutes les zones sont vides).
- Le nom du fichier de sortie inclut l'ID du modèle lorsqu'un modèle est utilisé (par exemple `meme-drake.png`).
- Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
