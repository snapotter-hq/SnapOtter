---
description: "Découpe une section d'un fichier audio en spécifiant les temps de début et de fin."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 0487cfcf46ef
i18n_hash_version: 2
---

# Rogner l'audio {#trim-audio}

Découpe une section d'un fichier audio. Conservez soit la partie comprise entre un temps de début et un temps de fin, soit retirez une durée fixe au début et à la fin.

Dans l'application, les champs de temps acceptent des secondes simples (`90`), `MM:SS` (`1:30`) ou `HH:MM:SS` (`1:02:03.5`). L'API prend des secondes.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Non | `range` | `range` conserve la partie de `startS` à `endS`. `ends` retire `cutStartS` au début et `cutEndS` à la fin |
| startS | number | Non | `0` | Mode plage : temps de début en secondes (minimum 0) |
| endS | number | Mode plage | - | Mode plage : temps de fin en secondes (doit être postérieur au début) |
| cutStartS | number | Non | `0` | Mode extrémités : secondes à retirer au début |
| cutEndS | number | Non | `0` | Mode extrémités : secondes à retirer à la fin |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Retirer les 2 premières secondes et les 3 dernières, quelle que soit la durée du fichier :

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Remarques {#notes}

- Les temps sont spécifiés en secondes et peuvent inclure des décimales (par ex. `10.5`).
- En mode plage, `endS` doit être supérieur à `startS`. Si `endS` dépasse la durée de l'audio, le fichier est rogné jusqu'à la fin.
- En mode extrémités, au moins une des valeurs `cutStartS` et `cutEndS` doit être supérieure à zéro, et ensemble elles doivent laisser au moins 0,1 seconde d'audio. Comme la coupe est mesurée à partir de la durée propre à chaque fichier, un même réglage fonctionne sur un lot de fichiers de durées différentes.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées uniquement décodables non prises en charge basculent vers MP3.
