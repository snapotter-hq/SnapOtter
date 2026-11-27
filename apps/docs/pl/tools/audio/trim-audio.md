---
description: "Wycina fragment z pliku audio przez podanie czasu początkowego i końcowego."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: b3e7541767ec
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Wycina fragment z pliku audio. Możesz zachować część między czasem początkowym a końcowym albo odciąć stałą ilość czasu z początku i z końca.

W aplikacji pola czasu przyjmują zwykłe sekundy (`90`), `MM:SS` (`1:30`) lub `HH:MM:SS` (`1:02:03.5`). API przyjmuje sekundy.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| mode | string | Nie | `range` | `range` zachowuje fragment od `startS` do `endS`. `ends` usuwa `cutStartS` z początku i `cutEndS` z końca |
| startS | number | Nie | `0` | Tryb range: czas początkowy w sekundach (minimum 0) |
| endS | number | Tryb range | - | Tryb range: czas końcowy w sekundach (musi być po początku) |
| cutStartS | number | Nie | `0` | Tryb ends: liczba sekund do usunięcia z początku |
| cutEndS | number | Nie | `0` | Tryb ends: liczba sekund do usunięcia z końca |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Odetnij pierwsze 2 sekundy i ostatnie 3 sekundy, niezależnie od długości pliku:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Czasy są podawane w sekundach i mogą zawierać ułamki dziesiętne (np. `10.5`).
- W trybie range wartość `endS` musi być większa niż `startS`. Jeśli `endS` przekracza czas trwania audio, plik jest przycinany do końca.
- W trybie ends co najmniej jedna z wartości `cutStartS` i `cutEndS` musi być większa od zera, a razem muszą pozostawić co najmniej 0,1 sekundy audio. Ponieważ cięcie jest liczone od długości każdego pliku, jedno ustawienie działa dla całej partii plików o różnych czasach trwania.
- Wynik zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane jako MP3.
