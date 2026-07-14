---
description: "Yerleşik Tesseract veya isteğe bağlı yüksek doğruluklu RapidOCR çalışma zamanı ile görüntülerden metni yerel olarak çıkarın."
i18n_output_hash: 9c5e3cba8b34
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Metin Çıkarma {#ocr-text-extraction}

Görüntüyü harici bir hizmete göndermeden görüntülerden metin çıkarın. Yerleşik `fast` katmanı Tesseract'yi kullanır. İsteğe bağlı `balanced` ve `best` katmanları, sabitlenmiş PP-OCR ONNX modelleriyle RapidOCR'yi kullanır.


<!-- korean-ocr-contract:start -->
::: info Korece OCR uyumluluğu
Hızlı OCR `auto`, `en`, `de`, `es`, `fr`, `zh` ve `ja` dillerini destekler, ancak Koreceyi (`ko`) desteklemez. Korece için doğru OCR paketi ve `balanced` ya da `best` gerekir. Paket resmi Linux amd64 ve arm64 kapsayıcılarında, OCR’nin CPU’da kaldığı NVIDIA ana bilgisayarları dahil çalışır. Desteklenmeyen sistemler açık bir uyumluluk hatası alır ve sessizce `fast` seçeneğine dönülmez. Korece ile `fast` veya eski `tesseract` diğer adı kuyruk öncesinde `FEATURE_INCOMPATIBLE` ve `fast-korean-unsupported` ile reddedilir.
:::
<!-- korean-ocr-contract:end -->
## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**İşleme:** OCR her zaman eşzamansız çalışır. Doğrulama ve kuyruğa alma işleminden sonra uç nokta hemen bir `jobId` ile `202 Accepted` döndürür. İşin SSE ilerleme akışını son `complete` veya `failed` olayına kadar izleyin; başarılı olayın `result` alanı OCR alanlarını içerir.

**Doğru OCR paketi:** İsteğe bağlı `ocr` çalışma zamanı (hedefe bağlı olarak indirilecek yaklaşık 208-234 MiB ve yüklü 409-488 MiB). `fast` bu paketi gerektirmez; yükleyici, imzalı dizine bağlı tam boyutları doğrular.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görüntü dosyası (çok parçalı), 512'ye kadar MiB kodlanmış ve 40 megapiksele kadar kodu çözülmüş; daha düşük bir operatör yükleme sınırı hâlâ geçerlidir |
| quality | string | HAYIR | Dinamik | Kalite kademesi: `fast` (Tesseract), `balanced` (küçük PP-OCRv6 modelleri ile RapidOCR) veya `best` (kalibre edilmiş değişken puanlamaya sahip daha yüksek doğruluklu orta PP-OCRv6 modelleri) |
| language | string | Hayır | `"auto"` | Dil ipucu: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | HAYIR | Seviyeye bağlı | Tanınmadan önce yerel kontrastı iyileştirin. Hızlı doğrudan uygular; Dengeli ve En İyi, yalnızca kalibre edilmiş puanlama sonucu iyileştirdiğinde varyantı korur. `best` için `true` ve `fast`/`balanced` için `false` varsayılanları |
| engine | string | HAYIR | - | Kullanımdan kaldırılan uyumluluk takma adı. Bunun yerine `quality` kullanın. `tesseract`, `fast` ile eşleşir; eski `paddleocr` değeri `balanced` ile eşleşir ancak PaddlePaddle'yi yüklemez |

`quality` ve `engine` belirtilmezse SnapOtter kullanılabilir en iyi katmanı şu sırayla seçer: `best`, `balanced`, `fast`. Korece için `fast` hiçbir zaman seçilmez; `best`, ardından `balanced` kullanılır veya doğru çalışma zamanının kurulum ya da uyumluluk hatası döndürülür.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Kabul edilen yanıt (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### İlerleme ve sonuç (SSE) {#progress-sse-optional}

`202` yanıtının döndürdüğü `jobId` (veya sağlanan `clientJobId`) ile `GET /api/v1/jobs/{jobId}/progress` adresine bağlanın. Son `complete` veya `failed` olayına kadar akışı açık tutun. Başarılı terminal karesi OCR çıktısını `result` içinde taşır:

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

İşleme hataları son `failed` olayının `error` alanında iletilir; kuyruğa alındıktan sonra HTTP `422` olarak döndürülmez.

## Notlar {#notes}

- `fast` her zaman desteklenen SnapOtter görüntülerinde mevcuttur. `balanced` ve `best`, isteğe bağlı doğru OCR paketini gerektirir.
- Yerleşik Tesseract, resmi görüntüye yaklaşık 25 MiB ekler. Doğru paket, görüntüye eklenmeden `/data/ai`'de saklanır.
- Resmi Linux amd64 ve arm64 konteynerleri için doğru paket yayınlandı. NVIDIA ana bilgisayarları da dahil olmak üzere ONNX Runtime'nin CPU sağlayıcısını bilinçli olarak kullanır, dolayısıyla CUDA kitaplıklarına veya GPU uyumluluğuna bağlı değildir. Kaynak ve önceden oluşturulmuş bare-metal kurulumları, kendi uyumlu çalışma zamanlarını sağlamadıkları sürece Hızlı OCR kullanır.
- Başarılı terminal `result`, hem `text` içindeki çıkarılmış metni hem de `downloadUrl` içindeki indirilebilir `.txt` yapıtını içerir.
- SnapOtter açıkça talep edilen bir seviyeyi karşılar. `balanced` veya `best` kullanılamıyorsa API, `FEATURE_NOT_INSTALLED` veya `FEATURE_INCOMPATIBLE` ile `501`'yi döndürür; isteği hiçbir zaman sessizce başka bir katmana düşürmez.
- Başarılı bir boş sonuç, boş bir sonuç olarak kalır. Çalışma zamanı hataları, daha düşük kaliteli bir motorla yeniden denemek yerine bir hata döndürür.
- Başarılı terminal `result`, hem `requestedQuality` hem de `actualQuality`'nin yanı sıra motor, cihaz, sağlayıcı, çalışma zamanı ve model sürümlerini ve tüm uyarıları bildirir.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR girdi biçimlerini otomatik çözme yoluyla destekler.
- Büyük boyutlu kodlanmış girişler `413` değerini döndürür. 40 megapikselin üzerindeki görüntüler ve sınırlı çıkış sınırlarını aşan OCR yanıtları, kısmen işlenmek yerine reddedilir.
