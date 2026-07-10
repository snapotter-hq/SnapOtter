---
description: "Zmieniaj rozmiar, optymalizuj, zmieniaj prędkość, odwracaj, obracaj i wyodrębniaj klatki z animowanych plików GIF w jednym narzędziu."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 90168d0b887b
---

# Narzędzia GIF {#gif-tools}

Zmieniaj rozmiar, optymalizuj, zmieniaj prędkość, odwracaj, wyodrębniaj klatki i obracaj animowane pliki GIF. Zapewnia wiele trybów działania w jednym narzędziu.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parametry {#parameters}

### Wspólne parametry {#common-parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| mode | string | Nie | `"resize"` | Tryb działania: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Nie | 0 | Liczba powtórzeń wyjściowego pliku GIF (0 = nieskończenie, 1-100 = skończona liczba pętli) |

### Parametry trybu zmiany rozmiaru {#resize-mode-parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| width | integer | Nie | - | Docelowa szerokość w pikselach (1 do 16384) |
| height | integer | Nie | - | Docelowa wysokość w pikselach (1 do 16384) |
| percentage | number | Nie | - | Skalowanie procentowe (1 do 500). Nadpisuje width/height, jeśli ustawione. |

### Parametry trybu optymalizacji {#optimize-mode-parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| colors | number | Nie | 256 | Maksymalna liczba kolorów w palecie (2 do 256) |
| dither | number | Nie | 1.0 | Siła ditheringu (0 do 1, gdzie 0 wyłącza dithering) |
| effort | number | Nie | 7 | Poziom wysiłku optymalizacji (1 do 10, wyższy = wolniej, ale mniejszy) |

### Parametry trybu prędkości {#speed-mode-parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Nie | 1.0 | Mnożnik prędkości (0.1 do 10). Wartości > 1 przyspieszają, < 1 spowalniają. |

### Parametry trybu wyodrębniania {#extract-mode-parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| extractMode | string | Nie | `"single"` | Tryb wyodrębniania: `single`, `range`, `all` |
| frameNumber | number | Nie | 0 | Indeks klatki do wyodrębnienia w trybie `single` (od 0) |
| frameStart | number | Nie | 0 | Indeks klatki początkowej dla trybu `range` (od 0) |
| frameEnd | number | Nie | - | Indeks klatki końcowej dla trybu `range` (od 0, włącznie) |
| extractFormat | string | Nie | `"png"` | Format wyodrębnionych klatek: `png`, `webp` |

### Parametry trybu obracania {#rotate-mode-parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| angle | number | Nie | - | Kąt obrotu: `90`, `180` lub `270` stopni |
| flipH | boolean | Nie | `false` | Odbij w poziomie |
| flipV | boolean | Nie | `false` | Odbij w pionie |

## Przykładowe żądania {#example-requests}

### Zmiana rozmiaru {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optymalizacja {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Przyspieszenie {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Wyodrębnienie pojedynczej klatki {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Podtrasa Info {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Zwraca metadane o animowanym pliku GIF bez jego przetwarzania.

### Żądanie Info {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Odpowiedź Info {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Uwagi {#notes}

- Wykorzystuje standardową fabrykę `createToolRoute` dla głównego punktu końcowego przetwarzania.
- Punkt końcowy info wymaga jedynie przesłania pliku (nie są potrzebne żadne ustawienia).
- W trybie `resize`, jeśli podano `percentage`, ma on priorytet nad `width`/`height`. Zmiana rozmiaru używa `fit: inside` w celu zachowania proporcji.
- W trybie `speed` opóźnienia klatek są dzielone przez współczynnik prędkości. Minimalne opóźnienie na klatkę wynosi 20 ms (ograniczenie specyfikacji GIF).
- W trybie `reverse` dostępny jest również parametr `speedFactor`, aby jednocześnie dostosować prędkość podczas odwracania.
- W trybie `extract` z `range` lub `all` wynikiem jest plik ZIP zawierający poszczególne klatki.
- W trybie `rotate` każda klatka jest przetwarzana indywidualnie i ponownie składana w animację.
- Parametr `loop` kontroluje, ile razy wyjściowy plik GIF się zapętla. Użyj 0 dla nieskończonego zapętlania.
- Pole `duration` w odpowiedzi info to całkowity czas trwania animacji w milisekundach.
