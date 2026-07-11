---
description: "Przyspiesz lub spowolnij odtwarzanie audio za pomocą mnożnika."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 365722965472
---

# Prędkość audio {#audio-speed}

Przyspiesz lub spowolnij odtwarzanie audio, stosując mnożnik prędkości.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| factor | number | Nie | `1.5` | Mnożnik prędkości (0.25 do 4). Wartości poniżej 1 spowalniają; powyżej 1 przyspieszają. |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Uwagi {#notes}

- Współczynnik `0.25` odtwarza z ćwierćprędkością (4x dłużej). Współczynnik `4` odtwarza z czterokrotną prędkością (4x krócej).
- Wysokość dźwięku jest zachowywana przy zmianie prędkości (rozciąganie w czasie). Użyj zmiany wysokości dźwięku, aby dostosować wysokość niezależnie.
- Wyjście zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane awaryjnie jako MP3.
