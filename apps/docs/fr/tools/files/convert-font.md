---
description: "Convertit des polices entre TTF, OTF, WOFF et WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: df1239366cfc
i18n_hash_version: 2
---

# Convertir une police {#convert-font}

Convertit un fichier de police entre TrueType (TTF), OpenType CFF (OTF), WOFF et WOFF2. Utilisez-le pour transformer une police de bureau en police web, ou pour obtenir un TTF à partir d'un OTF pour une application qui n'accepte que le TrueType.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Accepte des données de formulaire multipart contenant un fichier `.ttf`, `.otf`, `.woff` ou `.woff2` et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Non | `ttf` | Format de sortie : `ttf`, `otf`, `woff` ou `woff2` |

## Exemple de requête {#example-request}

OTF vers TTF :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF vers WOFF2 pour le web :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Remarques {#notes}

- WOFF et WOFF2 sont des enveloppes compressées autour des mêmes données de police : convertir vers ou depuis ces formats laisse donc les contours inchangés.
- La conversion OTF vers TTF transforme les courbes cubiques (CFF) en courbes quadratiques TrueType. Chaque courbe reste à moins de 1 unité de police de l'original, ce qui est invisible aux tailles normales, mais la conversion n'est pas exactement réversible. La conversion TTF vers OTF conserve la forme des courbes et arrondit seulement les points de contrôle à des unités de police entières.
- Les autorisations d'incorporation de la police (le champ OS/2 `fsType`) sont conservées telles quelles.
- Les collections de polices (`.ttc`) ne sont pas prises en charge. Les polices TrueType variables ne peuvent pas être converties en OTF, et les polices CFF2 variables ne peuvent pas être converties en TTF ; convertissez-les plutôt en WOFF ou WOFF2.
- La conversion s'exécute dans le worker de documents Python, avec le même délai d'expiration que les autres outils de documents, et non dans le processus de l'API.
