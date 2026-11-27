---
description: "Metni Base64'e kodlayın veya Base64'ü tekrar metne çözün."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: e61598258075
i18n_hash_version: 2
---

# Base64 Kodla / Çöz {#base64}

Base64 almak için metin yapıştırın veya metni geri almak için Base64 yapıştırın, ardından sonucu kopyalayın. Metin yalnızca kendi SnapOtter sunucunuza gider, başka hiçbir yere gitmez.

Bir görüntüyü Base64'e dönüştürmek için bunun yerine [Image to Base64](/tr/tools/image/image-to-base64) aracını kullanın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/base64`

Multipart form verisi değil, bir JSON gövdesi kabul eder ve indirilecek bir dosya yerine dönüştürülen metinle yanıt verir.

## Parametreler {#parameters}

| Ad | Tür | Varsayılan | Açıklama |
|------|------|---------|-------------|
| `text` | string | (zorunlu) | Kodlanacak metin veya çözülecek Base64. En fazla 1.000.000 karakter. |
| `mode` | string | (zorunlu) | `encode` veya `decode`. |
| `urlSafe` | boolean | `false` | Kodlarken URL güvenli alfabeyi (`-` ve `_`) kullanır ve `=` dolgusunu kaldırır. Çözerken yok sayılır. |

## Örnek İstek {#example-request}

Kodlama:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Çözme:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notlar {#notes}

- Metin UTF-8 olarak kodlanır, bu yüzden aksanlı harfler, CJK ve emoji bozulmadan gidip gelir.
- Çözme işlemi boşlukları ve satır sonlarını yok sayar, bu nedenle 76 sütunda satır kaydırılmış Base64 (e-posta, PEM gövdeleri) yapıştırıldığı gibi çözülür.
- Çözme işlemi `=` dolgusu olan veya olmayan girdiyi, standart (`+`, `/`) ya da URL güvenli (`-`, `_`) alfabede kabul eder, ancak ikisinin karışımını kabul etmez.
- Base64 olmayan girdi, `ENCODED_TEXT_INVALID` koduyla 400 hatasıyla başarısız olur. UTF-8 metin yerine ikili veriye (bir görüntü, bir ZIP) çözülen geçerli Base64 ise `DECODED_DATA_NOT_TEXT` ile başarısız olur.
