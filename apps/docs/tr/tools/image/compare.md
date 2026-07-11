---
description: "İki görüntüyü piksel düzeyinde fark görselleştirmesi ve benzerlik puanıyla yan yana karşılaştırın."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: 7b4fe2d118ec
---

# Görüntü Karşılaştırma {#image-compare}

Piksel düzeyinde bir fark haritası ve sayısal bir benzerlik yüzdesi hesaplamak için iki görüntü yükleyin. Çıktı, değişen bölgeleri kırmızıyla vurgulayan bir fark görüntüsüdür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/compare`

**İki** görüntü dosyasıyla çok parçalı form verilerini kabul eder. Ayarlar alanı gerekmez.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Tam olarak iki görüntü dosyası yükleyin.

| Alan | Tür | Zorunlu | Açıklama |
|-------|------|----------|-------------|
| file (ilk) | file | Evet | İlk görüntü |
| file (ikinci) | file | Evet | İkinci görüntü |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Yanıt Alanları {#response-fields}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| jobId | string | Fark görüntüsünü indirmek için iş tanımlayıcısı |
| similarity | number | İki görüntü arasındaki yüzde benzerlik (0 ile 100 arası) |
| dimensions | object | Karşılaştırma için kullanılan genişlik ve yükseklik |
| downloadUrl | string | Oluşturulan fark görüntüsünü indirme URL'si |
| originalSize | number | Her iki giriş görüntüsünün bayt cinsinden birleşik boyutu |
| processedSize | number | Fark çıktısı görüntüsünün bayt cinsinden boyutu |

## Notlar {#notes}

- Her iki görüntü de karşılaştırmadan önce aynı boyutlara (her eksenin maksimumu) yeniden boyutlandırılır.
- Fark görüntüsü, değişim büyüklüğüyle orantılı opaklıkla farkları kırmızıyla vurgular. Aynı veya neredeyse aynı pikseller (fark < 10) orijinalin yarı saydam versiyonları olarak gösterilir.
- Benzerlik, tüm pikseller boyunca ortalama piksel farkının tersi olarak hesaplanır ve yüzde olarak ifade edilir.
- %100 benzerlik, görüntülerin (karşılaştırma çözünürlüğünde) piksel düzeyinde aynı olduğu anlamına gelir.
- Fark çıktısı, giriş biçimlerinden bağımsız olarak her zaman PNG biçimindedir.
- Her iki görüntü de karşılaştırmadan önce doğrulanır ve çözülür (HEIC, RAW, PSD, SVG desteklenir).
- İşlemeden önce her iki görüntüde EXIF yönlendirmesi otomatik olarak uygulanır.
