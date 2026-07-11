---
description: "Konwertuj między mono a stereo lub zamień kanały lewy i prawy."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 848dedbade7d
---

# Kanały audio {#audio-channels}

Konwertuj dźwięk między układami mono i stereo lub zamień kanały lewy i prawy pliku stereo.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| mode | string | Tak | - | Operacja na kanałach: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Uwagi {#notes}

- `stereo-to-mono` miksuje oba kanały w pojedynczą ścieżkę mono.
- `mono-to-stereo` powiela kanał mono na kanały lewy i prawy.
- `swap` zamienia kanały lewy i prawy pliku stereo.
- Wyjście zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane awaryjnie jako MP3.
