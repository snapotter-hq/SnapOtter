---
description: "Bir PDF'nin her sayfasını A4, Letter, 4x6 inç kargo etiketi veya özel bir boyuta yeniden boyutlandırın."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 899d1936e43b
i18n_hash_version: 2
---

# PDF Sayfalarını Yeniden Boyutlandır {#resize-pdf-pages}

Bir PDF'deki her sayfanın sayfa boyutunu değiştirin. İçerik yeni sayfaya sığacak şekilde ölçeklenir ve ortalanır, bu yüzden metin, vektör çizimler ve barkodlar keskin kalır. Bunu bir kargo etiketini termal yazıcı için 4x6 inç sayfaya çevirmek veya bir belgeyi A4 ile US Letter arasında taşımak için kullanın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| pageSize | string | Hayır | `"4x6in"` | Hedef boyut: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` veya `custom` |
| width | number | Hayır | `4` | Özel sayfa genişliği, `pageSize` değeri `custom` olduğunda kullanılır |
| height | number | Hayır | `6` | Özel sayfa yüksekliği, `pageSize` değeri `custom` olduğunda kullanılır |
| unit | string | Hayır | `"in"` | Özel boyut için birim: `in` veya `mm` |
| keepOrientation | boolean | Hayır | `false` | Genişlik x yükseklik düzenini zorlamak yerine hedef boyutu her sayfanın yönüne uyacak şekilde çevirir |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notlar {#notes}

- Sayfalar sığacak şekilde ölçeklenir, asla gerilmez. En boy oranı farklı olduğunda artan boşluk boş bırakılır.
- Yeniden boyutlandırma kırpmaz. Letter veya A4 sayfanın dörtte birine basılmış bir etiket, yeni sayfanın yine yalnızca dörtte birini doldurur.
- Özel boyutlar her kenarda 0,5-200 inç (12,7-5080 mm) olmalıdır.
- Sayfa, varsa kırpma kutusundan yeniden boyutlandırılır, bu yüzden kırpılmış bir sayfa yalnızca kırpılan bölgeyi korur.
