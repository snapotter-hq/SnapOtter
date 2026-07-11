---
description: "Audio-Metadaten-Tags (ID3) ansehen, bearbeiten oder entfernen."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 0b5b38fb228d
---

# Audio-Metadaten {#audio-metadata}

Sieh dir Audio-Metadaten-Tags wie Titel, Interpret und Album an, bearbeite oder entferne sie (ID3 und ähnliche Tag-Formate).

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| strip | boolean | Nein | `false` | Alle vorhandenen Metadaten-Tags entfernen |
| title | string | Nein | - | Den Titel-Tag setzen (max. 500 Zeichen) |
| artist | string | Nein | - | Den Interpret-Tag setzen (max. 500 Zeichen) |
| album | string | Nein | - | Den Album-Tag setzen (max. 500 Zeichen) |

## Beispielanfrage {#example-request}

Metadaten-Tags bearbeiten:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Alle Metadaten entfernen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Beispielantwort {#example-response}

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

## Hinweise {#notes}

- Die Antwort enthält ein `metadata`-Objekt mit Containerformat, Dauer, Bitrate und aktuellen Tags.
- Wenn `strip` auf `true` steht, werden alle Tag-Felder ignoriert und jeder vorhandene Tag entfernt.
- Nur die von dir angegebenen Tags werden aktualisiert; nicht angegebene Tags bleiben unverändert.
- Das Ausgabeformat entspricht dem Eingabeformat.
