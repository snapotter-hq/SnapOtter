---
description: "Supprimer définitivement des occurrences de texte d'un PDF (censure véritable et vérifiée)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: dd04fc28ae22
---

# Censurer un PDF {#redact-pdf}

Supprimez définitivement des occurrences de texte spécifiées d'un PDF à l'aide d'une censure véritable et vérifiée. Le texte censuré est complètement retiré du fichier, et pas seulement recouvert d'un rectangle noir.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Oui | - | Chaînes de texte à censurer (1-50 termes, chacun jusqu'à 200 caractères) |
| caseSensitive | boolean | Non | `false` | Indique si la correspondance est sensible à la casse |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Remarques {#notes}

- Format d'entrée accepté : `.pdf`.
- Il s'agit d'un outil rapide (synchrone) qui renvoie le résultat directement.
- Cet outil effectue une censure véritable : le texte correspondant est retiré du flux de contenu du PDF, et non simplement masqué visuellement.
- Le champ `found` de la réponse indique le nombre d'occurrences censurées.
- Vous pouvez censurer jusqu'à 50 termes en une seule requête.
