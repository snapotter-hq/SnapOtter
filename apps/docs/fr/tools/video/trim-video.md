---
description: "Découpe un clip d'une vidéo en spécifiant les temps de début et de fin."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: d5fda0c10b89
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Découpe un clip d'une vidéo. Vous pouvez conserver la partie comprise entre un temps de début et un temps de fin, ou retirer une durée fixe au début et à la fin. Une option permet des coupes précises à l'image près.

Dans l'application, les champs de temps acceptent des secondes simples (`90`), `MM:SS` (`1:30`) ou `HH:MM:SS` (`1:02:03.5`). L'API accepte des secondes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` conserve de `startS` à `endS`. `ends` retire `cutStartS` au début et `cutEndS` à la fin |
| startS | number | No | `0` | Range mode : temps de début en secondes (doit être >= 0) |
| endS | number | Range mode | - | Range mode : temps de fin en secondes (doit être postérieur à startS) |
| cutStartS | number | No | `0` | Ends mode : secondes à retirer au début |
| cutEndS | number | No | `0` | Ends mode : secondes à retirer à la fin |
| precise | boolean | No | `false` | Réencode toute la plage pour obtenir des images de début et de fin exactes, au lieu de copier à partir de l'image clé suivante |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Retirer les 5 premières secondes et les 10 dernières secondes, quelle que soit la durée de la vidéo :

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Lorsque `precise` vaut `false` (par défaut), le clip commence exactement sur l'image demandée. Seules les images situées entre ce début et l'image clé suivante sont réencodées, le reste est copié, ce qui reste rapide. La fin peut déborder d'une image environ, car un flux copié conserve les images dont dépendent les précédentes. Les sources qui ne peuvent pas être raccordées en toute sécurité de cette manière (H.264 en 10 bits ou entrelacé, autres codecs nécessitant un début réencodé, ou fichiers AVI, FLV, MPEG et TS) sont réencodées intégralement.
- Définir `precise` sur `true` réencode toujours toute la plage, de sorte que les deux extrémités sont exactes, mais cela prend plus de temps.
- En range mode, `endS` doit être supérieur à `startS`. Si `endS` dépasse la fin de la vidéo, le clip va jusqu'à la fin.
- En ends mode, au moins l'une des valeurs `cutStartS` et `cutEndS` doit être supérieure à zéro, et ensemble elles doivent laisser une partie de la vidéo. Comme la coupe est mesurée à partir de la durée de chaque fichier, un seul réglage convient à un lot de vidéos de durées différentes.
