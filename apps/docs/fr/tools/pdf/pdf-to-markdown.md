---
description: "Convertir un PDF en Markdown, en conservant les titres, les listes et les tableaux lorsque le PDF en contient."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: f620e9049955
i18n_hash_version: 2
---

# PDF vers Markdown {#pdf-to-markdown}

Transformez un PDF en fichier Markdown que vous pouvez déposer dans un wiki, un site statique ou un pipeline LLM.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Accepte des données de formulaire multipart avec un fichier PDF.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez un PDF et récupérez un fichier `.md`.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Un PDF volumineux peut dépasser la fenêtre synchrone. L'API répond alors `202` avec un `jobId`, et vous suivez la progression à `/api/v1/jobs/{jobId}/progress`.

## Ce qui est conservé {#what-gets-kept}

Un PDF stocke du texte positionné, pas de la structure : le convertisseur la déduit.

- **Titres.** Les lignes courtes nettement plus grandes que le corps du texte deviennent des titres `#` à `######`, classés par taille sur l'ensemble du document.
- **Listes.** Les lignes qui commencent par une puce ou un numéro deviennent des éléments de liste.
- **Gras, italique et liens.** Conservés en ligne. Seuls les liens `http`, `https` et `mailto` sont conservés.
- **Tableaux.** Les tableaux tracés avec des traits de séparation deviennent des tableaux Markdown. Les tableaux mis en page par simple espacement ressortent généralement sous forme de paragraphes.

Les images sont supprimées. Les mises en page multicolonnes et les conceptions de page inhabituelles sont traitées au mieux, vérifiez donc le résultat avant de vous y fier.

## Remarques {#notes}

- Format d'entrée accepté : `.pdf`.
- Le champ `chars` de la réponse correspond à la longueur de la sortie Markdown.
- Un PDF numérisé n'a pas de couche de texte à convertir. L'outil le refuse avec `422` et le code `NO_TEXT_LAYER` au lieu de renvoyer un fichier vide. Utilisez l'outil [OCR de PDF](./ocr-pdf) pour ces fichiers.
- Pour l'aller-retour, [Markdown vers PDF](../files/markdown-to-pdf), [Markdown vers DOCX](../files/markdown-to-docx) et [Markdown vers HTML](../files/markdown-to-html) lisent les fichiers `.md`.
