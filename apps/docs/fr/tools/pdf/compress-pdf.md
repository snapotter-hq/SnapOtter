---
description: "Réduire la taille d'un fichier PDF en compressant les images intégrées."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: dad97321f449
---

# Compresser un PDF {#compress-pdf}

Réduisez la taille d'un fichier PDF en sous-échantillonnant les images intégrées. Choisissez entre un curseur de qualité ou une taille de fichier cible.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Non | `"quality"` | Mode de compression : `quality` ou `targetSize` |
| quality | integer | Non | `75` | Qualité de compression, 1-100 (plus élevé = moins de compression). Utilisé en mode `quality` |
| targetSizeKb | number | Non | - | Taille de fichier cible en kilo-octets. Utilisé en mode `targetSize` |

## Exemple de requête {#example-request}

Compresser par qualité :

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Compresser jusqu'à une taille cible :

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Remarques {#notes}

- En mode `quality`, des valeurs plus basses produisent des fichiers plus petits avec une plus forte dégradation des images.
- En mode `targetSize`, une recherche binaire trouve le DPI le plus élevé qui respecte la taille demandée.
- Si la compression devait agrandir le fichier, les octets d'origine sont renvoyés inchangés.
- Le texte et le contenu vectoriel ne sont pas affectés ; seules les images matricielles intégrées sont sous-échantillonnées.
