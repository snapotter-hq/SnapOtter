---
description: "Yerleşik Tesseract veya isteğe bağlı yüksek doğruluklu RapidOCR çalışma zamanı ile taranan PDF'lerden metni yerel olarak çıkarın."
i18n_output_hash: 9d1adaa5e2b7
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

PDF'yi harici bir hizmete göndermeden, taranan PDF belgelerinden metni sayfa sayfa çıkarın. Yerleşik `fast` katmanı Tesseract'yi kullanır. İsteğe bağlı `balanced` ve `best` katmanları, sabitlenmiş PP-OCR ONNX modelleriyle RapidOCR'yi kullanır.


<!-- korean-ocr-contract:start -->
::: info Korece OCR uyumluluğu
Hızlı OCR `auto`, `en`, `de`, `es`, `fr`, `zh` ve `ja` dillerini destekler, ancak Koreceyi (`ko`) desteklemez. Korece için doğru OCR paketi ve `balanced` ya da `best` gerekir. Paket resmi Linux amd64 ve arm64 kapsayıcılarında, OCR’nin CPU’da kaldığı NVIDIA ana bilgisayarları dahil çalışır. Desteklenmeyen sistemler açık bir uyumluluk hatası alır ve sessizce `fast` seçeneğine dönülmez. Korece ile `fast` veya eski `tesseract` diğer adı kuyruk öncesinde `FEATURE_INCOMPATIBLE` ve `fast-korean-unsupported` ile reddedilir.
:::
<!-- korean-ocr-contract:end -->
## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Bir PDF dosyası ve isteğe bağlı bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | PDF dosyası (çok parçalı), 512'ye kadar MiB kodlanmış; daha düşük bir operatör yükleme sınırı hâlâ geçerlidir |
| quality | string | HAYIR | Dinamik | OCR kalite katmanı: `fast`, `balanced` veya `best` |
| language | string | Hayır | `"auto"` | Belge dili: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Hayır | `"all"` | Sayfa seçimi, örn. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | HAYIR | Seviyeye bağlı | Tanınmadan önce yerel kontrastı iyileştirin. Hızlı doğrudan uygular; Dengeli ve En İyi, yalnızca kalibre edilmiş puanlama sonucu iyileştirdiğinde varyantı korur. `best` için `true` ve `fast`/`balanced` için `false` varsayılanları |
| engine | string | HAYIR | - | Kullanımdan kaldırılan uyumluluk takma adı. Bunun yerine `quality` kullanın. `tesseract`, `fast` ile eşleşir; eski `paddleocr` değeri `balanced` ile eşleşir ancak PaddlePaddle'yi yüklemez |

`quality` ve `engine` belirtilmezse SnapOtter kullanılabilir en iyi katmanı şu sırayla seçer: `best`, `balanced`, `fast`. Korece için `fast` hiçbir zaman seçilmez; `best`, ardından `balanced` kullanılır veya doğru çalışma zamanının kurulum ya da uyumluluk hatası döndürülür.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Örnek Yanıt {#example-response}

`202 Accepted` döndürür. İlerlemeyi `/api/v1/jobs/{jobId}/progress` adresinde SSE üzerinden izleyin.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notlar {#notes}

- Kabul edilen girdi biçimi: `.pdf`.
- `fast` yerleşiktir ve resmi görüntüye yaklaşık 25 MiB ekler. `balanced` ve `best`, isteğe bağlı doğru OCR paketini gerektirir (hedefe bağlı olarak indirmek için yaklaşık 208-234 MiB ve yüklü 409-488 MiB).
- Doğru paket, Linux amd64 ve arm64'yi destekler ve CPU üzerinde ONNX Runtime'yi kullanır, NVIDIA ana bilgisayarları dahil.
- Açıkça talep edilen bir seviye hiçbir zaman sessizce düşürülmez. `balanced` veya `best` kullanılamıyorsa API, `FEATURE_NOT_INSTALLED` veya `FEATURE_INCOMPATIBLE` ile `501`'yi döndürür.
- PDF sayfaları, OCR'den önce yüksek çözünürlükte rasterleştirilir. `best`, daha yüksek doğruluklu orta düzey PP-OCRv6 modellerini çalıştırır ve yönlendirme ve geliştirme değişkenlerini puanlayarak hız pahasına tanınmayı artırır.
- `auto` dil ayarı, desteklenen komut dosyası kümesinde tanımayı etkinleştirir; Açık bir ipucu, bilinen bir belge dili için sonuçları iyileştirebilir.
- Aralıklar (`"1-3"`), virgülle ayrılmış listeler (`"1,3,5"`) veya her sayfa için `"all"` kullanarak belirli sayfaları hedefleyebilirsiniz.
- Bir istek en fazla 50 sayfa işleyebilir. Rasterleştirilmiş karalama verileri 512 MiB ile sınırlandırılmıştır ve toplam UTF-8 OCR yanıtı 1.000.000 bayt ile sınırlandırılmıştır; limiti aşan işler kısmi metin döndürmek yerine başarısız olur.
- Zaten seçilebilir metin içeren PDF'ler için bunun yerine daha hızlı [PDF'ten Metne](./pdf-to-text) aracını kullanmayı düşünün.
