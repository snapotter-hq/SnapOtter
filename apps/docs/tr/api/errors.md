---
title: "Hata kodları"
description: "Hata gövdesinin yapısı, kararlı kodlar ve her biri için yapılması gerekenler."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 2b255d3bf3f2
i18n_hash_version: 2
---

# Hata kodları {#error-codes}

Her JSON hata yanıtı aynı yapıdadır:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Alan | Her zaman var | Anlamı |
|-------|----------------|---------|
| `error` | Evet | İnsanın okuyabileceği bir mesaj. Kullanıcılara göstermek güvenlidir. Ayrıştırmayın. |
| `code` | Evet | Kararlı, makine tarafından okunabilir bir kod. Mantığı bu koda göre dallandırın. |
| `requestId` | Evet | Sunucunun bu istek için verdiği kimlik. Sorun bildirirken belirtin; sunucu günlüğüyle eşleşir. |
| `details` | Bazen | Bazı 4xx hataları için ek bağlam, örneğin doğrulama mesajı. |

Mesajlar sürümler arasında değişebilir. Kodlar değişmez, bu yüzden istemci mantığını `code` üzerine yazın.

## HTTP durumundan gelen kodlar {#status-codes}

Bir rota kendi kodunu belirlemediğinde sunucu kodu durumdan türetir:

| HTTP durumu | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Diğer tüm 4xx durumları `BAD_REQUEST` koduna, diğer tüm 5xx durumları ise `INTERNAL_ERROR` koduna döner.

Bir rota daha özel bir kod belirleyebilir; bu durumda yanıt o kodu taşır. Örneğin AI paketi eksik olduğu için çalışamayan bir araç, özelliğe özgü bir kod döndürür. Bu kodlar, onları üreten özellikle birlikte açıklanır.

## Kimlik doğrulama ve erişim {#auth-codes}

| `code` | Durum | Yapılacak |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | `Authorization: Bearer <token>` değerini bir oturum belirteci veya API anahtarıyla (`si_...`) gönderin. |
| `FORBIDDEN` | 403 | Kimlik bilgisi geçerli ancak izin eksik. Bir yöneticiden bu izni isteyin. |
| `MUST_CHANGE_PASSWORD` | 403 | Hesap, diğer uç noktaları çağırmadan önce parolasını değiştirmelidir. Oturum belirteciyle `POST /api/auth/change-password` uç noktasını çağırın, ardından yeniden deneyin. |
| `USER_DISABLED` | 403 | Hesap devre dışı. Bir yöneticinin hesabı yeniden etkinleştirmesi gerekir. |
| `LOGIN_THROTTLED` | 429 | Çok fazla başarısız oturum açma denemesi. Yeniden denemeden önce bekleyin. |
| `VALIDATION_ERROR` | 400 | İstek gövdesi veya parametreleri doğrulamayı geçemedi. `details` sorunu belirtir. |

İlk çalıştırmadaki yönetici hesabı `admin` kullanıcı adı ve `admin` parolasıyla gelir; `DEFAULT_USERNAME` veya `DEFAULT_PASSWORD` bunu değiştirmediyse geçerlidir. `SKIP_MUST_CHANGE_PASSWORD` ayarlanmadıkça, parola değişene kadar bu hesap her çağrıda `MUST_CHANGE_PASSWORD` yanıtını alır.

## İşler {#job-codes}

Başarısız olan bir iş, nedenini HTTP hatasında değil işin kendisinde bildirir. `GET /api/v1/jobs/{jobId}` içinden `error.code` ve `error.message` değerlerini okuyun. Bkz. [İlerleme Takibi](/tr/api/rest#progress-tracking).

## Henüz kataloglanmayanlar {#not-yet-cataloged}

Tek tek özelliklerin (örneğin şifreleme, OIDC, SCIM ve ekipler) ürettiği kodlar bu sayfada henüz açıklanmamıştır. Her biri kararlı bir koddur; listede olmayan bir kodu opak kabul edin ve durumuna göre işleyin.
