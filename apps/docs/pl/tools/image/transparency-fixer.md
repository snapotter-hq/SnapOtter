---
description: "Napraw fałszywie przezroczyste pliki PNG za pomocą mattingu AI (BiRefNet), aby uzyskać prawdziwy kanał alfa, plus czyszczenie krawędzi metodą defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: e85aa5b620ef
---

# Naprawianie przezroczystości PNG {#png-transparency-fixer}

Napraw fałszywie przezroczyste pliki PNG jednym kliknięciem. Wykorzystuje matting AI (model BiRefNet HR Matting), aby uzyskać prawdziwą przezroczystość alfa, z przetwarzaniem końcowym defringe do oczyszczania krawędzi.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modeli:** `background-removal` (4-5 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| defringe | number | Nie | `30` | Intensywność defringe (0-100). Usuwa półprzezroczyste piksele obwódki wokół krawędzi |
| outputFormat | string | Nie | `"png"` | Format wyjściowy: `png` lub `webp` |
| removeWatermark | boolean | Nie | `false` | Zastosuj przetwarzanie wstępne usuwające znak wodny (filtr medianowy) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
```

## Odpowiedź {#response}

### Wstępna odpowiedź (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Postęp (SSE pod `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modeli `background-removal` (4-5 GB).
- Używa `birefnet-hr-matting` jako podstawowego modelu do wysokiej jakości mattingu alfa. Wraca do `birefnet-general`, jeśli modelowi HR zabraknie pamięci.
- Opcja `defringe` usuwa półprzezroczyste piksele obwódki, które matting AI czasem pozostawia wokół włosów, futra i drobnych krawędzi. Działa przez rozmycie kanału alfa i wyzerowanie pikseli o niskiej pewności.
- Opcja `removeWatermark` stosuje krok przetwarzania wstępnego z filtrem medianowym. Jest to podstawowa redukcja znaku wodnego, a nie dedykowane narzędzie do jego usuwania.
- Wyprowadza wyłącznie PNG lub bezstratny WebP (oba obsługują przezroczystość alfa).
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
