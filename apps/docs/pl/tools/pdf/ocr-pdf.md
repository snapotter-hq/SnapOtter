---
description: "Wyodrębnij lokalnie tekst ze zeskanowanych plików PDF za pomocą wbudowanego Tesseract lub opcjonalnego, bardzo dokładnego środowiska wykonawczego RapidOCR."
i18n_output_hash: d4e2a591634d
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

Wyodrębnij tekst ze zeskanowanych dokumentów PDF strona po stronie bez wysyłania PDF do usługi zewnętrznej. Wbudowana warstwa `fast` wykorzystuje Tesseract. Opcjonalne warstwy `balanced` i `best` wykorzystują RapidOCR z przypiętymi modelami PP-OCR ONNX.


<!-- korean-ocr-contract:start -->
::: info Zgodność OCR dla języka koreańskiego
Szybki OCR obsługuje `auto`, `en`, `de`, `es`, `fr`, `zh` i `ja`, ale nie język koreański (`ko`). Koreański wymaga dokładnego pakietu OCR i `balanced` lub `best`. Pakiet działa w oficjalnych kontenerach Linux amd64 i arm64, także na hostach NVIDIA, gdzie OCR nadal używa CPU. Nieobsługiwany system otrzymuje jawny błąd zgodności i nigdy po cichu nie przechodzi na `fast`. Koreański z `fast` lub starszym aliasem `tesseract` jest odrzucany przed zakolejkowaniem z `FEATURE_INCOMPATIBLE` i `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz opcjonalnym polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | plik PDF (wieloczęściowy), zakodowany do 512 MiB; nadal obowiązuje niższy limit przesyłania przez operatora |
| quality | string | NIE | Dynamiczny | Poziom jakości OCR: `fast`, `balanced` lub `best` |
| language | string | No | `"auto"` | Język dokumentu: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Wybór stron, np. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | NIE | Zależne od poziomu | Popraw lokalny kontrast przed rozpoznaniem. Fast stosuje go bezpośrednio; Zrównoważony i Najlepszy zachowują wariant tylko wtedy, gdy skalibrowana punktacja poprawia wynik. Domyślnie `true` dla `best` i `false` dla `fast`/`balanced` |
| engine | string | NIE | - | Przestarzały alias zgodności. Zamiast tego użyj `quality`. `tesseract` mapuje do `fast`; starsza wartość `paddleocr` jest odwzorowywana na `balanced`, ale nie ładuje PaddlePaddle |

Gdy pominięto `quality` i `engine`, SnapOtter wybiera najlepszy dostępny poziom w kolejności `best`, `balanced`, `fast`. Dla języka koreańskiego nigdy nie wybiera `fast`; używa `best`, następnie `balanced`, albo zwraca błąd instalacji lub zgodności dokładnego środowiska.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Zwraca `202 Accepted`. Śledź postęp przez SSE pod `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akceptowany format wejściowy: `.pdf`.
- `fast` jest wbudowany i dodaje około 25 MiB do oficjalnego obrazu. `balanced` i `best` wymagają opcjonalnego, dokładnego pakietu OCR (około 208-234 MiB do pobrania i 409-488 MiB zainstalowanego, w zależności od celu).
- Dokładny pakiet obsługuje Linux amd64 i arm64 i używa ONNX Runtime na CPU, w tym na hostach NVIDIA.
— Wyraźnie żądany poziom nigdy nie jest dyskretnie obniżany. Jeśli `balanced` lub `best` jest niedostępne, API zwraca `501` z `FEATURE_NOT_INSTALLED` lub `FEATURE_INCOMPATIBLE`.
- Strony PDF są rasteryzowane w wysokiej rozdzielczości przed OCR. `best` obsługuje modele średniej wielkości PP-OCRv6 o wyższej dokładności i ocenia warianty orientacji i ulepszeń, poprawiając rozpoznawanie kosztem szybkości.
- Ustawienie języka `auto` umożliwia rozpoznawanie w obrębie obsługiwanego zestawu skryptów; wyraźna wskazówka może poprawić wyniki w przypadku znanego języka dokumentu.
- Możesz wskazać konkretne strony za pomocą zakresów (`"1-3"`), list rozdzielonych przecinkami (`"1,3,5"`) lub `"all"` dla każdej strony.
- Żądanie może objąć maksymalnie 50 stron. Rasteryzowane dane tymczasowe są ograniczone do 512 MiB, a zagregowana odpowiedź UTF-8 OCR jest ograniczona do 1 000 000 bajtów; zadania przekraczające limit kończą się niepowodzeniem zamiast zwracać częściowy tekst.
- W przypadku plików PDF, które już zawierają zaznaczalny tekst, rozważ użycie szybszego narzędzia [PDF to Text](./pdf-to-text).
