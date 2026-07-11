---
description: "Usuwa ciche fragmenty z pliku audio."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 0edd3cc27822
---

# Silence Removal {#silence-removal}

Wykrywa i usuwa ciche fragmenty z pliku audio na podstawie konfigurowalnego progu i minimalnego czasu trwania.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | Nie | `-50` | Próg ciszy w dB (od -80 do -20). Dźwięk poniżej tego poziomu jest uznawany za ciszę. |
| minSilenceS | number | Nie | `0.5` | Minimalny czas trwania ciszy w sekundach do usunięcia (od 0,1 do 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Wyższy (mniej ujemny) próg działa agresywniej i usuwa również cichsze fragmenty, nie tylko rzeczywistą ciszę.
- Zwiększ `minSilenceS`, aby usuwać wyłącznie dłuższe przerwy, zachowując krótkie naturalne pauzy.
- Przydatne do czyszczenia nagrań podcastów, wykładów i notatek głosowych.
- Wynik zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane jako MP3.
