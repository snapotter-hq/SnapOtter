---
description: "Linéariser un PDF pour un affichage web rapide (téléchargement progressif)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 0b3a5cad2635
---

# Optimiser un PDF pour le web {#web-optimize-pdf}

Linéarisez un PDF afin qu'il puisse être téléchargé et affiché progressivement dans les navigateurs web sans attendre le fichier complet.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Accepte des données de formulaire multipart avec un fichier PDF. Aucun champ `settings` n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre de réglage. Téléversez directement le fichier PDF.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Remarques {#notes}

- La linéarisation réorganise la structure interne du PDF afin que la première page puisse s'afficher avant que le fichier complet ait été téléchargé.
- Le fichier de sortie peut être légèrement plus volumineux que l'entrée en raison des données de linéarisation ajoutées.
- Les PDF déjà linéarisés sont re-linéarisés sans problème.
