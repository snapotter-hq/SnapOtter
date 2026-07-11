---
description: "Générez un minuscule placeholder d'image de basse qualité avec URI de données base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 003299ed01d9
---

# Placeholder LQIP {#lqip-placeholder}

Générez un minuscule placeholder d'image de basse qualité (LQIP) à partir d'une image source. Renvoie un petit fichier de placeholder accompagné d'un URI de données base64, d'une balise HTML `<img>` prête à l'emploi et d'un extrait CSS `background-image` pour une intégration immédiate.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Accepte des données de formulaire multipart avec une image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Non | `16` | Largeur cible en pixels (4-64) |
| blur | number | Non | `2` | Rayon de flou pour la stratégie de flou (0-20) |
| strategy | string | Non | `"blur"` | Stratégie de placeholder : `blur`, `pixelate`, ou `solid` |
| format | string | Non | `"webp"` | Format de sortie : `webp`, `png`, ou `jpeg` |
| quality | integer | Non | `50` | Qualité de sortie (1-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Notes {#notes}

- Le champ `dataUri` contient l'URI de données complet, prêt à l'emploi dans les attributs `src` ou en CSS sans aucune requête supplémentaire.
- Les champs `html` et `css` fournissent des extraits à copier-coller pour les cas d'usage courants.
- La stratégie `blur` produit une miniature douce et floutée. La stratégie `pixelate` crée une mosaïque en blocs. La stratégie `solid` renvoie une seule couleur moyennée.
- Les tailles de placeholder typiques sont de 200 à 500 octets, ce qui les rend adaptés à une intégration directe dans le HTML.
- La hauteur est calculée automatiquement pour préserver le rapport d'aspect de l'image source.
- Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
