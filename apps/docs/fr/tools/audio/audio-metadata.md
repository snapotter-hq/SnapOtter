---
description: "Consulter, modifier ou supprimer les balises de métadonnées audio (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: a4a43115a499
---

# Métadonnées audio {#audio-metadata}

Consulter, modifier ou supprimer les balises de métadonnées audio telles que le titre, l'artiste et l'album (formats de balises ID3 et similaires).

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| strip | boolean | Non | `false` | Supprimer toutes les balises de métadonnées existantes |
| title | string | Non | - | Définir la balise de titre (500 caractères max) |
| artist | string | Non | - | Définir la balise d'artiste (500 caractères max) |
| album | string | Non | - | Définir la balise d'album (500 caractères max) |

## Exemple de requête {#example-request}

Modifier les balises de métadonnées :

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Supprimer toutes les métadonnées :

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Notes {#notes}

- La réponse inclut un objet `metadata` avec le format du conteneur, la durée, le débit et les balises actuelles.
- Lorsque `strip` vaut `true`, tous les champs de balises sont ignorés et chaque balise existante est supprimée.
- Seules les balises que vous fournissez sont mises à jour ; les balises non spécifiées restent inchangées.
- Le format de sortie correspond au format d'entrée.
