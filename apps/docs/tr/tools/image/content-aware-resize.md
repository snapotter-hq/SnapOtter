---
description: "Önemli içeriği ve yüzleri korumak için düşük önem taşıyan yollar boyunca piksel ekleyen veya kaldıran dikiş oyma yeniden boyutlandırma."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: e9a902a6bd97
---

# İçerik Duyarlı Yeniden Boyutlandırma {#content-aware-resize}

En az görsel öneme sahip yollar boyunca pikselleri akıllıca kaldıran veya ekleyen, önemli içeriği koruyan ve isteğe bağlı olarak yüzleri koruyan dikiş oyma yeniden boyutlandırma.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**İşleme:** Eşzamanlı (sonucu doğrudan döndürür)

**Model paketi:** Temel işlem için gerekmez. Yüz koruması, etkinleştirilirse `face-detection` paketini (200-300 MB) kullanır.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görüntü dosyası (çok parçalı) |
| width | number | Hayır | - | Piksel cinsinden hedef genişlik |
| height | number | Hayır | - | Piksel cinsinden hedef yükseklik |
| protectFaces | boolean | Hayır | `false` | Yüzleri algıla ve dikiş kaldırmadan koru |
| blurRadius | number | Hayır | `4` | Enerji hesaplaması için ön işleme bulanıklık yarıçapı (0-20) |
| sobelThreshold | number | Hayır | `2` | Sobel kenar algılama eşiği (1-20). Daha yüksek değerler algoritmayı daha agresif yapar |
| square | boolean | Hayır | `false` | Kareye yeniden boyutlandır (daha küçük boyutu kullanır) |

`width`, `height` veya `square` değerlerinden en az biri belirtilmelidir.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Yanıt (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notlar {#notes}

- Bu özel rota şu anda eşzamanlı bir 200 yanıtı döndürür.
- İçerik duyarlı yeniden boyutlandırma için `caire` dikiş oyma kitaplığını kullanır.
- Yalnızca boyutları küçültür (dikişleri kaldırır). Bir görüntüyü orijinal boyutunun ötesine genişletemez.
- `protectFaces` seçeneği, yüz bölgelerini yüksek enerjili olarak işaretlemek için AI yüz algılamasını kullanır ve dikişlerin yüzlerden geçmesini önler.
- `blurRadius`, enerji haritası hesaplamasından önce düzeltmeyi denetler. Daha yüksek değerler enerji haritasını daha eşit hale getirir, bu da gürültülü görüntülere yardımcı olabilir.
- `sobelThreshold`, kenarların ne kadar agresif algılandığını etkiler. Daha düşük değerler daha ince kenarları korur.
- Çıktı her zaman PNG biçimindedir.
- Otomatik çözme yoluyla HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini destekler.
