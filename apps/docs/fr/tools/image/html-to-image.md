---
description: "Capturez des pages web ou des extraits HTML en images haute qualité avec émulation d'appareil."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 285dc49086f4
i18n_hash_version: 2
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
| clientJobId | string | Non | - | Votre propre ID de tâche, pour pouvoir ouvrir le flux de progression avant l'arrivée de la réponse |

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

### Pages lentes {#slow-pages}

La capture s'exécute comme une tâche en file d'attente. Une capture qui se termine dans la fenêtre d'attente synchrone répond `200` avec le résultat ci-dessus. Une capture plus lente répond `202` avec un ID de tâche :

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Suivez `progressUrl` (Server-Sent Events) jusqu'à la fin de la tâche. L'événement de fin contient le même objet de résultat que la réponse `200`. Vous pouvez annuler la tâche avec `POST /api/v1/jobs/{jobId}/cancel`.

::: warning Modifié après la 2.3.0
Jusqu'à la 2.3.0, ce point de terminaison gardait toujours la requête ouverte jusqu'à la fin de la capture et répondait `200`. Les scripts qui ne gèrent que `200` doivent aussi gérer `202`.
:::

## Notes {#notes}

- Nécessite que Chromium soit installé sur le serveur. Renvoie HTTP 503 si le service de navigateur n'est pas disponible.
- Les URL sont validées contre les attaques SSRF (les adresses de réseau privé/interne sont bloquées).
- Ce point de terminaison est limité à 120 requêtes par heure.
- `originalSize` vaut toujours 0 puisque cet outil génère des images à partir d'URL/HTML.
- Le nom du fichier de sortie est `screenshot.<format>`.
- Si la page met trop de temps à charger, la requête renvoie HTTP 504 (délai d'attente de la passerelle dépassé).
- Si le service de navigateur plante à répétition, il est temporairement désactivé et la capture échoue avec HTTP 503 et le code `BROWSER_CRASHED`.
- Un plantage du navigateur (HTTP 503) est retenté une fois avant que l'échec ne soit signalé, comme pour les autres tâches d'image en file d'attente. Un délai de chargement de page dépassé n'est pas retenté.
- Une capture qui a déjà répondu `202` signale un échec sur son flux de progression plutôt que dans le statut HTTP.
