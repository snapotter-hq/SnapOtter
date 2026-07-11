---
description: "Nakładaj obrazy z określoną pozycją, przezroczystością i trybami mieszania w celu kompozycji."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: d43fc1e1545b
---

# Kompozycja obrazów {#image-composition}

Nałóż obraz nakładki na obraz bazowy z konfigurowalną pozycją, przezroczystością i trybem mieszania. Przydatne do komponowania logotypów, grafik lub łączenia wielu obrazów.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/compose`

Przyjmuje dane formularza multipart z **dwoma** plikami obrazów oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| x | number | Nie | `0` | Poziome przesunięcie nakładki od lewego górnego rogu w pikselach (min 0) |
| y | number | Nie | `0` | Pionowe przesunięcie nakładki od lewego górnego rogu w pikselach (min 0) |
| opacity | number | Nie | `100` | Procent przezroczystości nakładki (od 0 do 100) |
| blendMode | string | Nie | `"over"` | Tryb mieszania podczas kompozycji |

### Tryby mieszania {#blend-modes}

| Wartość | Opis |
|-------|-------------|
| `over` | Zwykłe nałożenie (domyślne) |
| `multiply` | Przyciemnianie przez mnożenie wartości pikseli |
| `screen` | Rozjaśnianie przez odwrócenie, mnożenie i ponowne odwrócenie |
| `overlay` | Łączy mnożenie i rozjaśnianie w zależności od jasności bazy |
| `darken` | Zachowuje ciemniejszy piksel z każdej warstwy |
| `lighten` | Zachowuje jaśniejszy piksel z każdej warstwy |
| `hard-light` | Nałożenie o silnym kontraście |
| `soft-light` | Nałożenie o subtelnym kontraście |
| `difference` | Wartość bezwzględna różnicy między warstwami |
| `exclusion` | Podobne do różnicy, ale o niższym kontraście |

### Pola plików {#file-fields}

| Nazwa pola | Wymagane | Opis |
|------------|----------|-------------|
| file | Tak | Obraz bazowy/tło |
| overlay | Tak | Obraz nakładki/pierwszego planu |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Użycie trybu mieszania multiply:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Uwagi {#notes}

- Oba obrazy są walidowane i dekodowane (obsługiwane HEIC, RAW, PSD, SVG) przed kompozycją.
- Nakładka jest umieszczana dokładnie we współrzędnych pikselowych określonych przez `x` i `y`. Nie jest skalowana do dopasowania.
- Jeśli przezroczystość jest mniejsza niż 100, przed mieszaniem do nakładki stosowana jest maska alfa.
- Nakładka może wykraczać poza granice obrazu bazowego (zostanie wtedy przycięta).
- Orientacja EXIF jest automatycznie stosowana do obu obrazów przed przetwarzaniem.
- Wymiary wyjściowe odpowiadają wymiarom obrazu bazowego.
