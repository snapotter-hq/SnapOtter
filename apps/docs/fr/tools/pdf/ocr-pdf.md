---
description: "Extraire le texte de documents PDF à l'aide d'une OCR assistée par IA."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 76a0a8e20bc9
---

# OCR de PDF {#pdf-ocr}

Extrayez le texte de documents PDF à l'aide de la reconnaissance optique de caractères assistée par IA. Prend en charge plusieurs niveaux de qualité et plusieurs langues. Nécessite l'installation du pack de fonctionnalités OCR.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` facultatif au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| quality | string | Non | `"balanced"` | Niveau de qualité OCR : `fast`, `balanced`, `best` |
| language | string | Non | `"auto"` | Langue du document : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Non | `"all"` | Sélection de pages, par exemple `"all"`, `"1-3"`, `"1,3,5"` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Exemple de réponse {#example-response}

Renvoie `202 Accepted`. Suivez la progression via SSE à `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Remarques {#notes}

- Format d'entrée accepté : `.pdf`.
- Il s'agit d'un outil d'IA qui nécessite l'installation du **pack de fonctionnalités OCR**. Si le pack n'est pas installé, l'API renvoie `501 Not Implemented`.
- Le niveau de qualité `fast` utilise un modèle plus léger pour un traitement plus rapide ; `best` utilise un modèle plus précis au prix de la vitesse.
- Le réglage de langue `auto` tente de détecter automatiquement la langue du document.
- Vous pouvez cibler des pages spécifiques à l'aide de plages (`"1-3"`), de listes séparées par des virgules (`"1,3,5"`), ou de `"all"` pour chaque page.
- Pour les PDF qui contiennent déjà du texte sélectionnable, envisagez plutôt d'utiliser l'outil [PDF vers texte](./pdf-to-text), plus rapide.
