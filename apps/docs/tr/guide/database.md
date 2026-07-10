---
description: "SnapOtter için PostgreSQL veritabanı şeması, tablolar, migration'lar ve yedekleme prosedürleri."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 1a738c4f269b
---

# Veritabanı {#database}

SnapOtter, veri kalıcılığı için [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) ile birlikte PostgreSQL 17 kullanır. Şema `apps/api/src/db/schema.ts` dosyasında tanımlanır.

Bağlantı, `DATABASE_URL` ortam değişkeni üzerinden yapılandırılır (varsayılan `postgres://snapotter:snapotter@postgres:5432/snapotter`). Docker Compose'da, Postgres container'ı verilerini `SnapOtter-pgdata` adlı volume'da saklar.

## Tablolar {#tables}

### users {#users}

Kullanıcı hesaplarını saklar. İlk çalıştırmada `DEFAULT_USERNAME` ve `DEFAULT_PASSWORD` değerlerinden otomatik olarak oluşturulur.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `username` | varchar | Benzersiz, zorunlu |
| `passwordHash` | varchar | scrypt hash |
| `role` | varchar | `admin`, `editor` veya `user` |
| `mustChangePassword` | boolean | Zorunlu parola sıfırlama bayrağı |
| `createdAt` | timestamp | Oluşturulma zamanı |
| `updatedAt` | timestamp | Son güncelleme zamanı |

### sessions {#sessions}

Etkin oturum açma oturumları. Her satır, bir oturum token'ını bir kullanıcıya bağlar.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | varchar | Birincil anahtar (oturum token'ı) |
| `userId` | uuid | `users.id` tablosuna yabancı anahtar |
| `expiresAt` | timestamp | Sona erme zamanı |
| `createdAt` | timestamp | Oluşturulma zamanı |

### teams {#teams}

Kullanıcıları düzenlemek için gruplar. Yöneticiler kullanıcıları takımlara atayabilir.

| Sütun | Tür | Açıklama |
|--------|------|-------------|
| `id` | uuid | Birincil anahtar |
| `name` | varchar (benzersiz, en fazla 50 karakter) | Takım adı |
| `createdAt` | timestamp | Oluşturulma zamanı |

### api_keys {#api-keys}

Programatik erişim için API anahtarları. Ham anahtar oluşturma sırasında bir kez gösterilir; yalnızca hash saklanır.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `userId` | uuid | `users.id` tablosuna yabancı anahtar |
| `keyHash` | varchar | Anahtarın scrypt hash'i |
| `name` | varchar | Kullanıcının verdiği etiket |
| `createdAt` | timestamp | Oluşturulma zamanı |
| `lastUsedAt` | timestamp | Kimliği doğrulanan her istekte güncellenir |

Anahtarlar, `si_` ön ekiyle başlar ve ardından 96 onaltılık karakter gelir (48 rastgele bayt).

### pipelines {#pipelines}

Kullanıcıların arayüzde oluşturduğu kaydedilmiş araç zincirleri.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `name` | varchar | Pipeline adı |
| `description` | varchar | İsteğe bağlı açıklama |
| `steps` | jsonb | `{ toolId, settings }` nesneleri dizisi |
| `createdAt` | timestamp | Oluşturulma zamanı |

### user_files {#user-files}

Sürüm zinciri izleme özellikli kalıcı dosya kütüphanesi. Sonucu kaydeden her işleme adımı, `parentId` üzerinden üst öğesine bağlı yeni bir satır oluşturarak bir sürüm ağacı meydana getirir.

| Sütun | Tür | Açıklama |
|--------|------|-------------|
| `id` | uuid | Birincil anahtar |
| `userId` | uuid | users tablosuna FK (CASCADE DELETE) |
| `originalName` | varchar | Özgün yükleme dosya adı |
| `storedName` | varchar | Diskteki dosya adı |
| `mimeType` | varchar | MIME türü |
| `size` | integer | Bayt cinsinden dosya boyutu |
| `width` | integer | Piksel cinsinden görsel genişliği |
| `height` | integer | Piksel cinsinden görsel yüksekliği |
| `version` | integer | Sürüm numarası (1 = özgün) |
| `parentId` | uuid veya null | user_files tablosuna FK (üst sürüm) |
| `toolChain` | jsonb | Bu sürümü üretmek için sırayla uygulanan araç ID'leri |
| `createdAt` | timestamp | Oluşturulma zamanı |

### jobs {#jobs}

İlerleme raporlaması ve temizlik için işleme job'larını izler.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `type` | varchar | Araç ya da pipeline tanımlayıcısı |
| `status` | varchar | `queued`, `processing`, `completed` veya `failed` |
| `progress` | real | 0.0-1.0 arası kesir |
| `inputFiles` | jsonb | Girdi dosya yolları dizisi |
| `outputPath` | varchar | Sonuç dosyasına giden yol |
| `settings` | jsonb | Kullanılan araç ayarları |
| `error` | varchar | Başarısız olursa hata mesajı |
| `createdAt` | timestamp | Oluşturulma zamanı |
| `completedAt` | timestamp | Tamamlanma zamanı |

### settings {#settings}

Yöneticilerin arayüzden değiştirebileceği, sunucu geneli ayarlar için anahtar-değer deposu.

| Sütun | Tür | Notlar |
|---|---|---|
| `key` | varchar | Birincil anahtar |
| `value` | varchar | Ayar değeri |
| `updatedAt` | timestamp | Son güncelleme zamanı |

### roles {#roles}

Ayrıntılı izinlere sahip özel roller.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `name` | varchar | Benzersiz rol adı |
| `description` | varchar | İsteğe bağlı açıklama |
| `permissions` | jsonb | İzin dizeleri dizisi |
| `createdAt` | timestamp | Oluşturulma zamanı |

### audit_log {#audit-log}

Güvenlikle ilgili eylem günlüğü.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `userId` | uuid | users tablosuna FK |
| `action` | varchar | Eylem türü |
| `details` | jsonb | Eyleme özgü veri |
| `createdAt` | timestamp | Eylem zamanı |

## Migration'lar {#migrations}

Şema migration'larını Drizzle yürütür. Migration dosyaları `apps/api/drizzle/` dizininde bulunur. Geliştirme sırasında:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Üretimde, bekleyen migration'lar başlatma sırasında otomatik olarak uygulanır.

## Yedekleme ve geri yükleme {#backup-and-restore}

İlişkisel veritabanı, uygulamanın `/data` volume'unda değil, Postgres container'ının `SnapOtter-pgdata` volume'unda bulunur.

**Seçenek 1: pg_dump (önerilen)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Seçenek 2: Volume anlık görüntüsü**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### 1.x'ten (SQLite) geçiş {#migrating-from-1-x-sqlite}

SnapOtter 1.x'ten yükseltmenin kendi kılavuzu vardır: bkz. [1.x'ten 2.0'a Yükseltme](./upgrading). Kısacası, mevcut `/data` volume'unuzu yeniden kullanın; 2.0 ilk açılışta `/data/snapotter.db` dosyasını otomatik olarak algılayıp içe aktarır (ya da ona açıkça işaret etmesi için `SQLITE_MIGRATE_PATH` değerini ayarlayın). Önce yalnızca `snapotter.db` dosyasını değil, tüm `/data` volume'unu yedekleyin: 1.x SQLite WAL modunu kullanır, bu yüzden durdurulmuş bir container genellikle verilerinin çoğunu neredeyse boş bir `snapotter.db` dosyasının yanındaki `snapotter.db-wal` dosyasında bırakır.
