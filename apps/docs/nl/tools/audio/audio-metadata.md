---
description: "Bekijk, bewerk of verwijder audio-metadatatags (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 49c525644c13
---

# Audio Metadata {#audio-metadata}

Bekijk, bewerk of verwijder audio-metadatatags zoals titel, artiest en album (ID3 en vergelijkbare tagformaten).

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| strip | boolean | Nee | `false` | Verwijder alle bestaande metadatatags |
| title | string | Nee | - | Stel de titeltag in (max 500 tekens) |
| artist | string | Nee | - | Stel de artiesttag in (max 500 tekens) |
| album | string | Nee | - | Stel de albumtag in (max 500 tekens) |

## Voorbeeldverzoek {#example-request}

Metadatatags bewerken:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Alle metadata verwijderen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Voorbeeldrespons {#example-response}

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

## Opmerkingen {#notes}

- De respons bevat een `metadata`-object met containerformaat, duur, bitrate en huidige tags.
- Wanneer `strip` `true` is, worden alle tagvelden genegeerd en wordt elke bestaande tag verwijderd.
- Alleen de tags die je opgeeft worden bijgewerkt; niet-opgegeven tags blijven ongewijzigd.
- Het uitvoerformaat komt overeen met het invoerformaat.
