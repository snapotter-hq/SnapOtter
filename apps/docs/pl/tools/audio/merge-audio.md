---
description: "Połącz wiele plików audio w jedną sekwencyjną ścieżkę."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 78a9c9241e3a
---

# Scal audio {#merge-audio}

Połącz dwa lub więcej plików audio w pojedynczą sekwencyjną ścieżkę, złączoną w kolejności ich przesłania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Przyjmuje dane formularza multipart z wieloma plikami audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Nie | `"mp3"` | Format wyjściowy: `mp3`, `wav`, `flac`, `m4a` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Uwagi {#notes}

- Przyjmuje od 2 do 10 plików audio na żądanie.
- Pliki są złączane w kolejności przesłania.
- Wszystkie pliki wejściowe są ponownie kodowane do wybranego formatu wyjściowego i częstotliwości próbkowania w celu płynnego łączenia.
- Obsługiwane są mieszane formaty wejściowe (np. jeden WAV i jeden MP3).
