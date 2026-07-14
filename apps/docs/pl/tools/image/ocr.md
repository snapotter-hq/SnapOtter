---
description: "Wyodrębnij lokalnie tekst z obrazów za pomocą wbudowanego Tesseract lub opcjonalnego środowiska wykonawczego RapidOCR o wysokiej dokładności."
i18n_output_hash: c79924df54eb
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Wyodrębnianie tekstu {#ocr-text-extraction}

Wyodrębnij tekst z obrazów bez wysyłania obrazu do usługi zewnętrznej. Wbudowana warstwa `fast` wykorzystuje Tesseract. Opcjonalne warstwy `balanced` i `best` wykorzystują RapidOCR z przypiętymi modelami PP-OCR ONNX.


<!-- korean-ocr-contract:start -->
::: info Zgodność OCR dla języka koreańskiego
Szybki OCR obsługuje `auto`, `en`, `de`, `es`, `fr`, `zh` i `ja`, ale nie język koreański (`ko`). Koreański wymaga dokładnego pakietu OCR i `balanced` lub `best`. Pakiet działa w oficjalnych kontenerach Linux amd64 i arm64, także na hostach NVIDIA, gdzie OCR nadal używa CPU. Nieobsługiwany system otrzymuje jawny błąd zgodności i nigdy po cichu nie przechodzi na `fast`. Koreański z `fast` lub starszym aliasem `tesseract` jest odrzucany przed zakolejkowaniem z `FEATURE_INCOMPATIBLE` i `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Przetwarzanie:** OCR zawsze działa asynchronicznie. Po sprawdzeniu danych i dodaniu zadania do kolejki punkt końcowy natychmiast zwraca `202 Accepted` z `jobId`. Śledź strumień postępu SSE zadania aż do końcowego zdarzenia `complete` lub `failed`; `result` zdarzenia zakończonego powodzeniem zawiera pola OCR.

**Dokładny pakiet OCR:** Opcjonalne środowisko wykonawcze `ocr` (około 208-234 MiB do pobrania i 409-488 MiB zainstalowanego, w zależności od celu). `fast` nie wymaga tego pakietu; instalator sprawdza dokładne rozmiary powiązane z podpisanym indeksem.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (wieloczęściowy), do 512 zakodowanych w MiB i dekodowanych w rozdzielczości 40 megapikseli; nadal obowiązuje niższy limit przesyłania przez operatora |
| quality | string | NIE | Dynamiczny | Poziom jakości: `fast` (Tesseract), `balanced` (RapidOCR z małymi modelami PP-OCRv6) lub `best` (średnie modele PP-OCRv6 o wyższej dokładności z kalibrowaną punktacją wariantów) |
| language | string | Nie | `"auto"` | Podpowiedź językowa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | NIE | Zależne od poziomu | Popraw lokalny kontrast przed rozpoznaniem. Fast stosuje go bezpośrednio; Zrównoważony i Najlepszy zachowują wariant tylko wtedy, gdy skalibrowana punktacja poprawia wynik. Domyślnie `true` dla `best` i `false` dla `fast`/`balanced` |
| engine | string | NIE | - | Przestarzały alias zgodności. Zamiast tego użyj `quality`. `tesseract` mapuje do `fast`; starsza wartość `paddleocr` jest odwzorowywana na `balanced`, ale nie ładuje PaddlePaddle |

Gdy pominięto `quality` i `engine`, SnapOtter wybiera najlepszy dostępny poziom w kolejności `best`, `balanced`, `fast`. Dla języka koreańskiego nigdy nie wybiera `fast`; używa `best`, następnie `balanced`, albo zwraca błąd instalacji lub zgodności dokładnego środowiska.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Zaakceptowana odpowiedź (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Postęp i wynik (SSE) {#progress-sse-optional}

Połącz się z `GET /api/v1/jobs/{jobId}/progress`, używając `jobId` zwróconego w odpowiedzi `202` (lub podanego `clientJobId`). Utrzymuj strumień otwarty aż do końcowego zdarzenia `complete` lub `failed`. Pomyślna ramka końcowa zawiera wynik OCR w polu `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

Błędy przetwarzania są przekazywane w polu `error` końcowego zdarzenia `failed`; po dodaniu do kolejki nie są zwracane jako HTTP `422`.

## Uwagi {#notes}

- `fast` jest zawsze dostępny w obsługiwanych obrazach SnapOtter. `balanced` i `best` wymagają opcjonalnego, dokładnego pakietu OCR.
- Wbudowany Tesseract dodaje około 25 MiB do oficjalnego obrazu. Dokładny pakiet jest przechowywany w `/data/ai`, a nie wtapiany w obraz.
- Dokładny pakiet został opublikowany dla oficjalnych kontenerów Linux amd64 i arm64. Celowo korzysta z dostawcy CPU firmy ONNX Runtime, w tym na hostach NVIDIA, więc nie zależy to od bibliotek CUDA ani kompatybilności GPU. Instalacje źródłowe i prekompilowane bare-metal korzystają z Fast OCR, chyba że zapewniają własne kompatybilne środowisko wykonawcze.
- Pomyślne końcowe `result` zawiera zarówno wyodrębniony tekst w `text`, jak i artefakt `.txt` do pobrania w `downloadUrl`.
- SnapOtter honoruje wyraźnie żądany poziom. Jeśli `balanced` lub `best` jest niedostępne, API zwraca `501` z `FEATURE_NOT_INSTALLED` lub `FEATURE_INCOMPATIBLE`; nigdy po cichu nie obniża poziomu żądania do innego poziomu.
- Pomyślny pusty wynik pozostaje pustym wynikiem. Błędy w czasie wykonywania zwracają błąd zamiast ponawiania próby z aparatem o niższej jakości.
— Pomyślne końcowe `result` podaje zarówno `requestedQuality`, jak i `actualQuality`, a także wersję silnika, urządzenia, dostawcy, środowiska wykonawczego i modelu oraz wszelkie ostrzeżenia.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
- Ponadwymiarowe zakodowane wejścia zwracają `413`. Obrazy o rozdzielczości powyżej 40 megapikseli i odpowiedzi OCR przekraczające ograniczone limity wyjściowe są odrzucane zamiast częściowo przetwarzane.
