---
description: "Bir görseldeki belirli bir rengi başka bir renkle değiştirin veya saydam yapın."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 56726ab0952d
---

# Rengi Değiştir ve Tersine Çevir {#replace-invert-color}

Bir kaynak renkle eşleşen pikselleri bir hedef renkle değiştirin veya saydam yapın. Renk sınırlarında düzgün geçiş için yapılandırılabilir toleransla RGB uzayında Öklid mesafesini kullanır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Bir görsel dosyası ve bir JSON `settings` alanı içeren çok parçalı form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Hayır | `"#FF0000"` | Bulunacak hex rengi (biçim: `#RRGGBB`) |
| targetColor | string | Hayır | `"#00FF00"` | Değiştirilecek hex rengi (biçim: `#RRGGBB`) |
| makeTransparent | boolean | Hayır | `false` | Eşleşen pikselleri hedef renkle değiştirmek yerine saydam yap |
| tolerance | number | Hayır | `30` | Renk eşleştirme toleransı (0 ile 255 arası). Daha yüksek değerler daha geniş bir benzer renk aralığıyla eşleşir |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Yeşil bir arka planı saydam yap:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notlar {#notes}

- Renk eşleştirme, `tolerance * sqrt(3)` ile ölçeklenen RGB uzayında Öklid mesafesini kullanır.
- Değiştirme geçişi renk mesafesiyle orantılıdır: kaynak renge daha yakın pikseller hedef rengin daha fazlasını alır ve düzgün geçişler oluşturur.
- `makeTransparent` değeri `true` olduğunda, girdi biçimi alfa kanallarını desteklemiyorsa (örn. JPEG) çıktı PNG'ye (veya WebP/AVIF) zorlanır.
- 0 toleransı yalnızca tam kaynak rengiyle eşleşir. Daha yüksek değerler (50+) daha geniş bir benzer ton aralığıyla eşleşir.
- Saydamlık gerekmedikçe ve girdi biçiminde alfa desteği bulunmadıkça çıktı biçimi girdi biçimiyle eşleşir.
