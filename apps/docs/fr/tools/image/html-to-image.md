---
description: "Capturez des pages web ou des extraits HTML en images haute qualité avec émulation d'appareil."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: 8eea95f108ae
---

# HTML vers image {#html-to-image}

Capturez l'URL d'une page web ou un contenu HTML brut sous forme d'image de capture d'écran. Prend en charge l'émulation d'appareil (ordinateur, tablette, mobile), la capture de page entière et plusieurs formats de sortie.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Accepte un **corps JSON** (pas de multipart). Aucun téléversement de fichier n'est nécessaire.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| url | string | Conditionnel | - | URL à capturer (doit être une URL valide) |
| html | string | Conditionnel | - | Contenu HTML brut à rendre (1 à 5 000 000 caractères) |
| format | string | Non | `"png"` | Format de sortie : `jpg`, `png`, `webp` |
| quality | number | Non | `90` | Qualité de sortie pour les formats avec perte (1 à 100) |
| fullPage | boolean | Non | `false` | Capturer la page entière défilable, pas seulement la fenêtre d'affichage |
| devicePreset | string | Non | `"desktop"` | Émulation d'appareil : `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Non | `1280` | Largeur personnalisée de la fenêtre d'affichage en pixels (320 à 3840, utilisée quand devicePreset vaut `custom`) |
| viewportHeight | number | Non | `720` | Hauteur personnalisée de la fenêtre d'affichage en pixels (320 à 2160, utilisée quand devicePreset vaut `custom`) |

Soit `url`, soit `html` doit être fourni, mais pas les deux.

### Préréglages d'appareil {#device-presets}

| Préréglage | Largeur | Hauteur | UA mobile |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Non |
| `tablet` | 768 | 1024 | Non |
| `mobile` | 375 | 812 | Oui |
| `custom` | (défini par l'utilisateur) | (défini par l'utilisateur) | Non |

## Exemple de requête {#example-request}

Capturer une page web :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Rendre un contenu HTML :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Notes {#notes}

- Nécessite que Chromium soit installé sur le serveur. Renvoie HTTP 503 si le service de navigateur n'est pas disponible.
- Les URL sont validées contre les attaques SSRF (les adresses de réseau privé/interne sont bloquées).
- Ce point de terminaison est limité à 120 requêtes par heure.
- `originalSize` vaut toujours 0 puisque cet outil génère des images à partir d'URL/HTML.
- Le nom du fichier de sortie est `screenshot.<format>`.
- Si la page met trop de temps à charger, la requête renvoie HTTP 504 (délai d'attente de la passerelle dépassé).
- Si le service de navigateur plante à répétition, il est temporairement désactivé et renvoie HTTP 503 avec le code `BROWSER_CRASHED`.
