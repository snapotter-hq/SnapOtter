---
description: "Wycięcie klipu z wideo poprzez podanie czasu początku i końca."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 93f3e4accc59
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Wycina klip z wideo. Można zachować fragment między czasem początku i końca albo odciąć stałą ilość od początku i końca. Dostępna jest opcja cięć z dokładnością do klatki.

W aplikacji pola czasu przyjmują zwykłe sekundy (`90`), `MM:SS` (`1:30`) lub `HH:MM:SS` (`1:02:03.5`). API przyjmuje sekundy.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| mode | string | Nie | `range` | `range` zachowuje fragment od `startS` do `endS`. `ends` usuwa `cutStartS` od początku i `cutEndS` od końca |
| startS | number | Nie | `0` | Tryb zakresu: czas początku w sekundach (musi być >= 0) |
| endS | number | Tryb zakresu | - | Tryb zakresu: czas końca w sekundach (musi być po startS) |
| cutStartS | number | Nie | `0` | Tryb końców: sekundy do usunięcia od początku |
| cutEndS | number | Nie | `0` | Tryb końców: sekundy do usunięcia od końca |
| precise | boolean | Nie | `false` | Ponowne kodowanie całego zakresu, aby początek i koniec były dokładnie co do klatki, zamiast kopiowania od następnej klatki kluczowej |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Odetnij pierwsze 5 sekund i ostatnie 10 sekund, niezależnie od długości wideo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Uwagi {#notes}

- Gdy `precise` ma wartość `false` (domyślnie), klip zaczyna się dokładnie na żądanej klatce. Ponownie kodowane są tylko klatki od tego początku do następnej klatki kluczowej, a reszta jest kopiowana, więc operacja pozostaje szybka. Koniec może być o klatkę lub około tego za długi, ponieważ skopiowany strumień zachowuje klatki, od których zależą wcześniejsze klatki. Źródła, których nie da się bezpiecznie połączyć (H.264 10-bitowy lub z przeplotem, inne kodeki wymagające ponownie zakodowanego początku albo pliki AVI, FLV, MPEG i TS), są zamiast tego kodowane ponownie w całości.
- Ustawienie `precise` na `true` zawsze ponownie koduje cały zakres, więc oba końce są dokładne, ale trwa to dłużej.
- W trybie zakresu `endS` musi być większe niż `startS`. Jeśli `endS` wykracza poza koniec wideo, klip trwa do końca.
- W trybie końców co najmniej jedno z `cutStartS` i `cutEndS` musi być większe od zera, a razem muszą pozostawiać jakąś część wideo. Ponieważ cięcie jest liczone względem długości każdego pliku, jedno ustawienie działa dla partii wideo o różnej długości.
