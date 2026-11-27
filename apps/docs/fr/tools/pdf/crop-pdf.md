---
description: "Rogner toutes les pages d'un PDF par marges ou selon une région."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: bf0284a31032
i18n_hash_version: 2
---

# Rogner un PDF {#crop-pdf}

Rognez toutes les pages d'un PDF avec une marge sur chaque bord, une marge distincte par bord, ou selon une région, comme une étiquette d'expédition imprimée dans un coin de la feuille.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Non | `uniform` | `uniform`, `sides` ou `region` |
| margin | number | Non | `20` | Mode `uniform` : marge de rognage pour chaque bord en points (0-2000) |
| top, right, bottom, left | number | Non | `0` | Mode `sides` : marge de rognage pour chaque bord séparément en points (0-2000) |
| x, y | number | Non | `0` | Mode `region` : décalage de la région par rapport aux bords gauche et supérieur de la page en points |
| width, height | number | Non | `288`, `432` | Mode `region` : taille de la région en points (une étiquette de 4x6 in) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Conservez uniquement l'étiquette de 4x6 in située dans le coin supérieur gauche de chaque page :

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Remarques {#notes}

- Toutes les valeurs sont exprimées en points PDF (1 point = 1/72 pouce). Une page US Letter mesure 612 x 792 points.
- Chaque mode ne lit que ses propres champs, donc une requête qui n'envoie que `margin` continue de fonctionner.
- Une région se mesure depuis le coin supérieur gauche de chaque page et doit tenir dans toutes les pages. Les marges doivent laisser une partie de chaque page. Sinon, la requête échoue avec `400`.
- Sur une page configurée pour s'afficher pivotée, les positions et les bords se rapportent à la page telle qu'elle est affichée, de sorte que le coin supérieur gauche d'une région est le coin supérieur gauche de la page pivotée.
- Chaque mode mesure depuis la boîte média complète, donc rogner une page déjà rognée repart de la page entière. Une marge uniforme de `0` affiche toute la boîte média.
