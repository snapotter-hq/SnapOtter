---
description: "Apposer des images de signature téléversées sur un PDF à l'aide de placements de page normalisés."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: e72288f186c4
---

# Signer un PDF {#sign-pdf}

Apposez une ou plusieurs images de signature PNG téléversées sur n'importe quelle page d'un PDF. Cette route utilise un contrat multipart personnalisé car elle a besoin du PDF, d'une ou plusieurs images de signature et des coordonnées de placement.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Accepte des données de formulaire multipart. Le PDF est envoyé en tant que `file` ; les signatures sont envoyées en tant que `sig0`, `sig1`, et ainsi de suite ; les placements sont envoyés dans un champ JSON `placements`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier PDF à signer |
| sig0 | file | Oui | - | Première image de signature. Les images supplémentaires utilisent `sig1`, `sig2`, et ainsi de suite |
| placements | JSON string | Oui | - | Tableau d'objets de placement : `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | Non | - | UUID facultatif pour le suivi de la progression via SSE |
| fileId | string | Non | - | ID de bibliothèque de fichiers facultatif pour enregistrer le résultat signé comme nouvelle version |

## Coordonnées de placement {#placement-coordinates}

| Champ | Type | Description |
|-------|------|-------------|
| sig | integer | Index de l'image de signature. `0` correspond à `sig0` |
| page | integer | Index de page PDF commençant à zéro |
| x | number | Position gauche en fraction de page |
| y | number | Position haute en fraction de page |
| w | number | Largeur de la signature en fraction de page |
| h | number | Hauteur de la signature en fraction de page |

Les coordonnées utilisent une origine en haut à gauche. Les valeurs peuvent légèrement dépasser le bord de la page ; le moteur de rendu PDF découpe le tampon final à la page.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Si la requête ne peut pas se terminer dans la fenêtre d'attente synchrone, l'API renvoie :

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Connectez-vous à `/api/v1/jobs/<jobId>/progress` et téléchargez le résultat une fois le travail terminé.

## Remarques {#notes}

- Format d'entrée PDF accepté : `.pdf`.
- Les images de signature doivent être des fichiers image valides, généralement au format PNG avec transparence.
- Jusqu'à 100 images de signature et 100 placements sont acceptés.
- `sign-pdf` est une route personnalisée et n'utilise pas le champ JSON `settings` d'outil standard.
