---
description: "Automatyczne ulepszanie jednym kliknięciem, które analizuje obraz i koryguje ekspozycję, kontrast, balans bieli, nasycenie i ostrość."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: e8d464571edb
---

# Ulepszanie obrazu {#image-enhancement}

Automatyczne ulepszanie jednym kliknięciem z inteligentną analizą. Analizuje obraz i stosuje korekcje ekspozycji, kontrastu, balansu bieli, nasycenia, ostrości i odszumiania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Przetwarzanie:** Synchroniczne (używa fabryki `createToolRoute`, zwraca wynik bezpośrednio)

**Pakiet modelu:** Nie jest wymagany do podstawowego ulepszania. Pakiet `upscale-enhance` (5-6 GB) jest używany tylko wtedy, gdy włączone jest `deepEnhance` (do usuwania szumów AI za pomocą SCUNet).

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| mode | string | Nie | `"auto"` | Tryb ulepszania: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Nie | `50` | Ogólna intensywność ulepszania (0-100) |
| corrections | object | Nie | wszystkie `true` | Selektywne korekcje do zastosowania (patrz niżej) |
| deepEnhance | boolean | Nie | `false` | Włącz usuwanie szumów wspomagane AI (wymaga zainstalowanego narzędzia `noise-removal`) |

### Obiekt corrections {#corrections-object}

| Pole | Typ | Domyślnie | Opis |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Automatyczna korekcja ekspozycji |
| contrast | boolean | `true` | Automatyczna korekcja kontrastu |
| whiteBalance | boolean | `true` | Automatyczna korekcja balansu bieli |
| saturation | boolean | `true` | Automatyczna korekcja nasycenia |
| sharpness | boolean | `true` | Automatyczne wyostrzanie |
| denoise | boolean | `true` | Lekkie odszumianie |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Odpowiedź (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Punkt końcowy Analyze {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Analizuje obraz i zwraca zalecenia korekcji bez ich stosowania.

### Parametry {#parameters-1}

| Parametr | Typ | Wymagany | Opis |
|-----------|------|----------|-------------|
| file | file | Tak | Plik obrazu (multipart) |

### Przykładowe żądanie {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Odpowiedź (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Uwagi {#notes}

- To narzędzie używa synchronicznej fabryki `createToolRoute`, więc zwraca standardową odpowiedź (nie 202 async).
- Parametr `mode` dostosowuje sposób ważenia korekcji (np. tryb portretowy jest łagodniejszy dla odcieni skóry, tryb krajobrazowy zwiększa nasycenie).
- Gdy `deepEnhance` jest włączone i narzędzie `noise-removal` (SCUNet) jest zainstalowane, po standardowych korekcjach stosowany jest dodatkowy przebieg odszumiania AI.
- Punkt końcowy analyze jest przydatny do podglądu, jakie korekcje zostałyby zastosowane, przed ich zatwierdzeniem.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
