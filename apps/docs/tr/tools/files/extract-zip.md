---
description: "Bomba korumasıyla bir ZIP arşivinden dosyaları güvenle çıkarın."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 4fdbe031d53c
---

# Extract ZIP {#extract-zip}

Bir ZIP arşivinden dosyaları güvenle çıkarın. Tek dosyalı arşivler içerdikleri dosyayı doğrudan döndürür; çok dosyalı arşivler çıkarılan içerikle düz bir ZIP döndürür.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Bir ZIP dosyası içeren multipart form verisi kabul eder. Bir ayarlar alanı gerekmez.

## Parameters {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Çıkarmak için bir `.zip` dosyası yükleyin.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- Giriş olarak yalnızca `.zip` dosyaları kabul edilir.
- Arşiv tek bir dosya içeriyorsa, o dosya doğrudan döndürülür (bir ZIP içine sarılmaz).
- Arşiv birden fazla dosya içeriyorsa, tüm dosyalar kök seviyeye çıkarılmış şekilde düz bir ZIP döndürülür (iç içe dizin yapısı düzleştirilir).
- Yerleşik bomba koruması, kaynak tükenmesini önlemek için aşırı sıkıştırma oranlarına veya dosya sayılarına sahip arşivleri reddeder.
