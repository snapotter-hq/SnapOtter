---
description: "Dzieli audio według interwałów czasowych, równych części lub wykrywania ciszy."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 04bac50ca49d
---

# Split Audio {#split-audio}

Dzieli plik audio na segmenty według stałych interwałów czasowych, równych części lub automatycznego wykrywania ciszy. Zwraca archiwum ZIP z segmentami.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| mode | string | Nie | `"time"` | Strategia dzielenia: `time`, `parts`, `silence` |
| segmentS | number | Nie | `60` | Długość segmentu w sekundach, od 1 do 3600 (używana, gdy tryb to `time`) |
| parts | integer | Nie | `2` | Liczba równych części, od 2 do 20 (używana, gdy tryb to `parts`) |
| thresholdDb | number | Nie | `-40` | Próg ciszy w dB, od -80 do -20 (używany, gdy tryb to `silence`) |
| minSilenceS | number | Nie | `0.3` | Minimalna przerwa ciszy w sekundach, od 0,1 do 10 (używana, gdy tryb to `silence`) |

## Example Request {#example-request}

Podział na 30-sekundowe segmenty:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Podział według wykrywania ciszy:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` wskazuje archiwum ZIP zawierające wszystkie segmenty.
- Używane są tylko parametry istotne dla wybranego `mode`; pozostałe są ignorowane.
- Nazwy plików segmentów są numerowane sekwencyjnie (np. `part-000.mp3`, `part-001.mp3`).
- Format wyjściowy odpowiada formatowi wejściowemu.
