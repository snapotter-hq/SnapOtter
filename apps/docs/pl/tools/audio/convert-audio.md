---
description: "Konwertuj dźwięk między formatami MP3, WAV, OGG, FLAC i M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 43ae9e92f50c
---

# Konwertuj audio {#convert-audio}

Konwertuj pliki audio między popularnymi formatami, w tym MP3, WAV, OGG, FLAC i M4A, z konfigurowalną przepływnością wyjściową.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Nie | `"mp3"` | Format wyjściowy: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Nie | `192` | Przepływność wyjściowa w kbps (32 do 320) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Uwagi {#notes}

- Obsługiwane formaty wejściowe obejmują MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF i OPUS.
- Przepływność dotyczy tylko formatów stratnych (MP3, OGG, M4A). Formaty bezstratne, takie jak WAV i FLAC, ignorują to ustawienie.
- Nazwa pliku wyjściowego zachowuje oryginalną nazwę z nowym rozszerzeniem.
