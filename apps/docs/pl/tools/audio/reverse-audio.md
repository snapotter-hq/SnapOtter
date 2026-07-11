---
description: "Odwróć plik audio, aby odtwarzał się wstecz."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 3101a5e69d3a
---

# Odwróć audio {#reverse-audio}

Odwróć plik audio, aby odtwarzał się wstecz.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Cały plik audio jest odwracany.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Uwagi {#notes}

- Cała ścieżka audio jest odwracana od końca do początku.
- Wyjście zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane awaryjnie jako MP3.
