---
description: "Ajouter des numéros de page à chaque page d'un PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 04a135cb1dd0
---

# Numéros de page PDF {#pdf-page-numbers}

Ajoutez des numéros de page « Page N sur M » à chaque page d'un PDF.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| position | string | Non | `"bc"` | Emplacement du numéro de page : `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | Non | `10` | Taille de police en points (6-24) |

### Valeurs de position {#position-values}

- `tl` en haut à gauche, `tc` en haut au centre, `tr` en haut à droite
- `bl` en bas à gauche, `bc` en bas au centre, `br` en bas à droite

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Remarques {#notes}

- Les numéros de page sont affichés au format « Page 1 sur 10 ».
- Les numéros sont ajoutés à chaque page, y compris toute page de titre ou de couverture existante.
- La position par défaut `"bc"` place les numéros en bas au centre de chaque page.
