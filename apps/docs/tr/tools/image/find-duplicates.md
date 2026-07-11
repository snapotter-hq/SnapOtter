---
description: "Algısal karma kullanarak yinelenen ve neredeyse yinelenen görselleri tespit edin."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 60bf8830f7de
---

# Yinelenenleri Bul {#find-duplicates}

Algısal karma (dHash) kullanarak yinelenenleri ve neredeyse yinelenenleri tespit etmek için birden fazla görsel yükleyin. Benzer görselleri birlikte gruplandırır, her gruptaki en iyi kalitedeki sürümü belirler ve olası alan tasarrufunu hesaplar.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Birden fazla görsel dosyası ve isteğe bağlı bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| threshold | number | Hayır | `8` | Görselleri yinelenen olarak kabul etmek için maksimum Hamming mesafesi (0 ile 20 arası). Daha düşük = daha katı eşleştirme |

### Dosya Alanları {#file-fields}

Multipart isteğinde en az 2 görsel dosyası yükleyin (tümü `file` alan adını veya dosya bölümleri için herhangi bir alan adını kullanarak).

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Örnek Yanıt {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Yanıt Alanları {#response-fields}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| totalImages | number | Başarıyla analiz edilen görsel sayısı |
| duplicateGroups | array | Yinelenen görsel grupları |
| uniqueImages | number | Herhangi bir yinelenen grubun parçası olmayan görsel sayısı |
| spaceSaveable | number | En iyi olmayan yinelenenleri kaldırarak tasarruf edilebilecek toplam bayt |
| skippedFiles | array | İşlenemeyen dosyalar (dosya adı ve nedeniyle birlikte) |

### Yinelenen Grup Nesnesi {#duplicate-group-object}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| groupId | number | Grup tanımlayıcısı |
| files | array | Bu yinelenen gruptaki görseller |

### Dosya Nesnesi (bir grup içinde) {#file-object-within-a-group}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| filename | string | Orijinal dosya adı |
| similarity | number | Referans görsele (gruptaki ilki) benzerlik yüzdesi |
| width | number | Piksel cinsinden görsel genişliği |
| height | number | Piksel cinsinden görsel yüksekliği |
| fileSize | number | Bayt cinsinden dosya boyutu |
| format | string | Görsel biçimi |
| isBest | boolean | Bunun en yüksek kalitedeki sürüm olup olmadığı (en fazla piksel, en büyük dosya) |
| thumbnail | string veya null | Önizleme için Base64 JPEG küçük resim (200px genişliğinde) |

## Notlar {#notes}

- Algısal benzerlik tespiti için 128 bitlik bir dHash (64 bitlik satır + 64 bitlik sütun) kullanır. Bu, yeniden boyutlandırma, yeniden sıkıştırma ve küçük düzenlemeler arasında bile yinelenenleri yakalar.
- Eşik değeri, karmalar arasındaki maksimum Hamming mesafesini temsil eder. Varsayılan 8 değeri, yanlış pozitiflerden kaçınırken neredeyse yinelenenleri yakalar. Yalnızca piksel bakımından aynı olanlar için 0, çok gevşek eşleştirme için 15-20 kullanın.
- Her gruptaki "en iyi" görsel, en fazla piksele (genişlik x yükseklik) sahip olandır; eşitlik durumunda dosya boyutu belirleyicidir.
- En az 2 görsel gereklidir. Doğrulama veya çözümlemede başarısız olan dosyalar, tüm isteğin başarısız olmasına neden olmak yerine `skippedFiles` içinde bildirilir.
- Küçük resimler, veri URI'leri olarak kodlanmış 200px genişliğinde JPEG önizlemeleridir.
- Tüm yaygın biçimler desteklenir (HEIC, RAW, PSD, SVG otomatik olarak çözümlenir).
