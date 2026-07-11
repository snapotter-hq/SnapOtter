---
description: "Ajouter un filigrane textuel à chaque page d'un PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: b2024fb0f76a
---

# Filigraner un PDF {#watermark-pdf}

Apposez un filigrane textuel sur chaque page d'un PDF avec une position, une taille, une opacité et une rotation configurables.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| text | string | Oui | - | Texte du filigrane (1-200 caractères) |
| position | string | Non | `"c"` | Emplacement sur la page : `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Non | `48` | Taille de police en points (6-72) |
| opacity | number | Non | `0.3` | Opacité du filigrane (0.05-1) |
| rotation | number | Non | `45` | Angle de rotation en degrés (-180 à 180) |

### Valeurs de position {#position-values}

- `tl` en haut à gauche, `tc` en haut au centre, `tr` en haut à droite
- `l` au centre à gauche, `c` au centre, `r` au centre à droite
- `bl` en bas à gauche, `bc` en bas au centre, `br` en bas à droite

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Remarques {#notes}

- Le filigrane est rendu sous forme de superposition de texte sur chaque page.
- Le même texte, la même position et le même style de filigrane sont appliqués uniformément à toutes les pages.
- Utilisez des valeurs d'opacité plus faibles (0.1-0.3) pour des filigranes subtils qui n'obscurcissent pas le contenu.
