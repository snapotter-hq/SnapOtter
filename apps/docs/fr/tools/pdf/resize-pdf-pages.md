---
description: "Redimensionne chaque page d'un PDF en A4, Letter, étiquette d'expédition 4x6 in ou taille personnalisée."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: b8cb164ea04a
i18n_hash_version: 2
---

# Redimensionner les pages d'un PDF {#resize-pdf-pages}

Change le format de chaque page d'un PDF. Le contenu est mis à l'échelle pour tenir dans la nouvelle page et centré, si bien que le texte, les dessins vectoriels et les codes-barres restent nets. Servez-vous-en pour transformer une étiquette d'expédition en page 4x6 in pour une imprimante thermique, ou pour passer un document de l'A4 au US Letter.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Accepte des données de formulaire multipart avec un fichier PDF et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | Non | `"4x6in"` | Format cible : `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` ou `custom` |
| width | number | Non | `4` | Largeur de page personnalisée, utilisée lorsque `pageSize` vaut `custom` |
| height | number | Non | `6` | Hauteur de page personnalisée, utilisée lorsque `pageSize` vaut `custom` |
| unit | string | Non | `"in"` | Unité de la taille personnalisée : `in` ou `mm` |
| keepOrientation | boolean | Non | `false` | Fait pivoter le format cible pour suivre l'orientation de chaque page au lieu d'imposer largeur par hauteur |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Remarques {#notes}

- Les pages sont mises à l'échelle pour tenir, jamais étirées. Quand le rapport d'aspect diffère, l'espace restant reste vide.
- Le redimensionnement ne recadre pas. Une étiquette imprimée sur un quart d'une page Letter ou A4 n'occupe toujours qu'un quart de la nouvelle page.
- Les tailles personnalisées doivent mesurer de 0,5 à 200 in (12,7 à 5080 mm) de chaque côté.
- La page est redimensionnée à partir de sa zone de recadrage lorsqu'elle en a une, donc une page recadrée ne garde que la région recadrée.
