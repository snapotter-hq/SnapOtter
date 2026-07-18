---
description: "Konwertuj dźwięk między formatami MP3, WAV, OGG, FLAC i M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 43ae9e92f50c
---

# Konwertuj audio {#convert-audio}

Konwertuj pliki audio między popularnymi formatami, w tym MP3, WAV, OGG, FLAC i M4A, z konfigurowalną przepływnością wyjściową i częstotliwością próbkowania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Nie | `"mp3"` | Format wyjściowy: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Nie | `192` | Przepływność wyjściowa w kbps (32 do 320) |
| sampleRate | integer | Nie | częstotliwość źródłowa | Wyjściowa częstotliwość próbkowania w Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` lub `96000`. Pomiń, aby zachować częstotliwość źródłową |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Uwagi {#notes}

- Obsługiwane formaty wejściowe obejmują MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF i OPUS.
- Przepływność dotyczy tylko formatów stratnych (MP3, OGG, M4A). Formaty bezstratne, takie jak WAV i FLAC, ignorują to ustawienie.
- Wyjście MP3 obsługuje częstotliwości próbkowania do 48000 Hz. Opcja 96000 Hz dotyczy tylko formatów WAV, OGG, FLAC i M4A.
- Przepływność MP3 jest ograniczona przez częstotliwość próbkowania: maksymalnie 64 kbps przy 8000 Hz i 160 kbps przy 16000 lub 22050 Hz. Żądania przekraczające ten limit są odrzucane, a nie po cichu obniżane.
- Nazwa pliku wyjściowego zachowuje oryginalną nazwę z nowym rozszerzeniem.
