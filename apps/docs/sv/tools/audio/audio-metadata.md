---
description: "Visa, redigera eller ta bort ljudmetadatataggar (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 9e5aabfad8b3
---

# Audio Metadata {#audio-metadata}

Visa, redigera eller ta bort ljudmetadatataggar som titel, artist och album (ID3 och liknande taggformat).

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| strip | boolean | Nej | `false` | Ta bort alla befintliga metadatataggar |
| title | string | Nej | - | Ange titeltaggen (max 500 tecken) |
| artist | string | Nej | - | Ange artisttaggen (max 500 tecken) |
| album | string | Nej | - | Ange albumtaggen (max 500 tecken) |

## Exempelförfrågan {#example-request}

Redigera metadatataggar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Ta bort all metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Exempelsvar {#example-response}

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

## Anteckningar {#notes}

- Svaret inkluderar ett `metadata`-objekt med containerformat, längd, bithastighet och aktuella taggar.
- När `strip` är `true` ignoreras alla taggfält och varje befintlig tagg tas bort.
- Endast de taggar du anger uppdateras; ospecificerade taggar förblir oförändrade.
- Utdataformatet matchar inmatningsformatet.
