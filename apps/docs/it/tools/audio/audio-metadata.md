---
description: "Visualizza, modifica o rimuovi i tag di metadati audio (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 1deb134d1e4d
---

# Metadati audio {#audio-metadata}

Visualizza, modifica o rimuovi i tag di metadati audio come titolo, artista e album (ID3 e formati di tag simili).

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| strip | boolean | No | `false` | Rimuovi tutti i tag di metadati esistenti |
| title | string | No | - | Imposta il tag del titolo (max 500 caratteri) |
| artist | string | No | - | Imposta il tag dell'artista (max 500 caratteri) |
| album | string | No | - | Imposta il tag dell'album (max 500 caratteri) |

## Esempio di richiesta {#example-request}

Modifica i tag di metadati:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Rimuovi tutti i metadati:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Esempio di risposta {#example-response}

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

## Note {#notes}

- La risposta include un oggetto `metadata` con formato del container, durata, bitrate e tag correnti.
- Quando `strip` è `true`, tutti i campi dei tag vengono ignorati e ogni tag esistente viene rimosso.
- Vengono aggiornati solo i tag che fornisci; i tag non specificati rimangono invariati.
- Il formato di output corrisponde al formato di input.
