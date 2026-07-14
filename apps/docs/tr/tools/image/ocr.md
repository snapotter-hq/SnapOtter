---
description: "Yerleşik Tesseract veya isteğe bağlı yüksek doğruluklu RapidOCR çalışma zamanı ile görüntülerden metni yerel olarak çıkarın."
i18n_output_hash: 9c5e3cba8b34
i18n_source_hash: 01c6fa6aebe7
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

**İşleniyor:** OCR eşzamanlı pencere içinde tamamlandığında JSON ile `200`'yi döndürür. Daha uzun işler geri döner `202`; `result` aynı OCR alanlarını içeren terminal olayına kadar işin SSE ilerleme akışını izleyin.

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

## Yanıt (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
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
```

### İlerleme (SSE, isteğe bağlı) {#progress-sse-optional}

`clientJobId` form alanı sağlanırsa ilerleme olaylarının akışı sağlanır. `202` yanıtı, istemcinin `complete` terminali veya `failed` olayına kadar akışı açık tutması gerektiği anlamına gelir:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notlar {#notes}

- `fast` her zaman desteklenen SnapOtter görüntülerinde mevcuttur. `balanced` ve `best`, isteğe bağlı doğru OCR paketini gerektirir.
- Yerleşik Tesseract, resmi görüntüye yaklaşık 25 MiB ekler. Doğru paket, görüntüye eklenmeden `/data/ai`'de saklanır.
- Resmi Linux amd64 ve arm64 konteynerleri için doğru paket yayınlandı. NVIDIA ana bilgisayarları da dahil olmak üzere ONNX Runtime'nin CPU sağlayıcısını bilinçli olarak kullanır, dolayısıyla CUDA kitaplıklarına veya GPU uyumluluğuna bağlı değildir. Kaynak ve önceden oluşturulmuş bare-metal kurulumları, kendi uyumlu çalışma zamanlarını sağlamadıkları sürece Hızlı OCR kullanır.
- OCR, bir görsel indirme URL'si yerine doğrudan çıkarılan metni döndürür.
- SnapOtter açıkça talep edilen bir seviyeyi karşılar. `balanced` veya `best` kullanılamıyorsa API, `FEATURE_NOT_INSTALLED` veya `FEATURE_INCOMPATIBLE` ile `501`'yi döndürür; isteği hiçbir zaman sessizce başka bir katmana düşürmez.
- Başarılı bir boş sonuç, boş bir sonuç olarak kalır. Çalışma zamanı hataları, daha düşük kaliteli bir motorla yeniden denemek yerine bir hata döndürür.
- Yanıt, hem `requestedQuality` hem de `actualQuality`'nin yanı sıra motor, cihaz, sağlayıcı, çalışma zamanı ve model sürümlerini ve tüm uyarıları bildirir.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR girdi biçimlerini otomatik çözme yoluyla destekler.
- Büyük boyutlu kodlanmış girişler `413` değerini döndürür. 40 megapikselin üzerindeki görüntüler ve sınırlı çıkış sınırlarını aşan OCR yanıtları, kısmen işlenmek yerine reddedilir.
