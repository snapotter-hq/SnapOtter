---
description: "SnapOtter için PostgreSQL veritabanı şeması, tablolar, migrasyonlar ve yedekleme prosedürleri."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: bd5835bc1dc0
i18n_hash_version: 2
---

# Veritabanı {#database}

SnapOtter, veri kalıcılığı için [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) ile PostgreSQL 17 kullanır. Şema `apps/api/src/db/schema.ts` içinde tanımlıdır.

Bağlantı, `DATABASE_URL` ortam değişkeniyle yapılandırılır (varsayılan `postgres://snapotter:snapotter@postgres:5432/snapotter`). Docker Compose'ta Postgres konteyneri verilerini `SnapOtter-pgdata` adlı biriminde saklar. İstekler yalnızca satırları okuyup yazabilen bir rol üzerinden sunulur; bu, aşağıda [En düşük yetkili roller](#least-privilege-roles) bölümünde ele alınır.

## Tablolar {#tables}

### users {#users}

Kullanıcı hesaplarını saklar. İlk çalıştırmada `DEFAULT_USERNAME` ve `DEFAULT_PASSWORD` değerlerinden otomatik olarak oluşturulur.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `username` | varchar | Benzersiz, zorunlu |
| `passwordHash` | varchar | scrypt özeti |
| `role` | varchar | `admin`, `editor` veya `user` |
| `mustChangePassword` | boolean | Zorunlu parola sıfırlama bayrağı |
| `createdAt` | timestamp | Oluşturma zamanı |
| `updatedAt` | timestamp | Son güncelleme zamanı |

### sessions {#sessions}

Etkin oturum açma oturumları. Her satır bir oturum belirtecini bir kullanıcıya bağlar.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | varchar | Birincil anahtar (oturum belirteci) |
| `userId` | uuid | `users.id` tablosuna yabancı anahtar |
| `expiresAt` | timestamp | Sona erme zamanı |
| `createdAt` | timestamp | Oluşturma zamanı |

### teams {#teams}

Kullanıcıları düzenlemek için gruplar. Yöneticiler kullanıcıları takımlara atayabilir.

| Sütun | Tür | Açıklama |
|--------|------|-------------|
| `id` | uuid | Birincil anahtar |
| `name` | varchar (benzersiz, en fazla 50 karakter) | Takım adı |
| `createdAt` | timestamp | Oluşturma zamanı |

### api_keys {#api-keys}

Programatik erişim için API anahtarları. Ham anahtar oluşturulurken yalnızca bir kez gösterilir; yalnızca özeti saklanır.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `userId` | uuid | `users.id` tablosuna yabancı anahtar |
| `keyHash` | varchar | Anahtarın scrypt özeti |
| `name` | varchar | Kullanıcının verdiği etiket |
| `createdAt` | timestamp | Oluşturma zamanı |
| `lastUsedAt` | timestamp | Kimliği doğrulanmış her istekte güncellenir |

Anahtarlar `si_` önekiyle başlar ve ardından 96 onaltılık karakter (48 rastgele bayt) gelir.

### pipelines {#pipelines}

Kullanıcıların arayüzde oluşturduğu kayıtlı araç zincirleri.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `name` | varchar | Pipeline adı |
| `description` | varchar | İsteğe bağlı açıklama |
| `steps` | jsonb | `{ toolId, settings }` nesnelerinden oluşan dizi |
| `createdAt` | timestamp | Oluşturma zamanı |

### user_files {#user-files}

Kalıcı dosya kitaplığı. Kaydedilen bir düzenleme varsayılan olarak bağımsız bir kök satır olarak eklenir ("yeni olarak kaydet": `version` 1, `parentId` null; böylece orijinal listede kalır) veya orijinalin üzerine yazdığınızda ebeveyne bağlı bir sürüm olarak eklenir (`parentId` ayarlanır, `version` artırılır ve orijinalin yerini alır). `toolChain` sütunu uygulanan araçları kaydeder.

| Sütun | Tür | Açıklama |
|--------|------|-------------|
| `id` | uuid | Birincil anahtar |
| `userId` | uuid | users tablosuna FK (CASCADE DELETE) |
| `originalName` | varchar | Yüklemedeki özgün dosya adı |
| `storedName` | varchar | Diskteki dosya adı |
| `mimeType` | varchar | MIME türü |
| `size` | integer | Bayt cinsinden dosya boyutu |
| `width` | integer | Piksel cinsinden görsel genişliği |
| `height` | integer | Piksel cinsinden görsel yüksekliği |
| `version` | integer | Sürüm numarası (1 = orijinal) |
| `parentId` | uuid veya null | user_files tablosuna FK (ebeveyn sürüm) |
| `toolChain` | jsonb | Bu sürümü üretmek için sırayla uygulanan araç kimlikleri |
| `createdAt` | timestamp | Oluşturma zamanı |

### jobs {#jobs}

İlerleme raporlama ve temizlik için işleme işlerini izler.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `type` | varchar | Araç veya pipeline tanımlayıcısı |
| `status` | varchar | `queued`, `processing`, `completed` veya `failed` |
| `progress` | real | 0.0-1.0 kesri |
| `inputFiles` | jsonb | Girdi dosya yollarından oluşan dizi |
| `outputPath` | varchar | Sonuç dosyasının yolu |
| `settings` | jsonb | Kullanılan araç ayarları |
| `error` | varchar | Başarısız olursa hata mesajı |
| `createdAt` | timestamp | Oluşturma zamanı |
| `completedAt` | timestamp | Tamamlanma zamanı |

### settings {#settings}

Yöneticilerin arayüzden değiştirebildiği sunucu genelindeki ayarlar için anahtar-değer deposu.

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
| `permissions` | jsonb | İzin dizelerinden oluşan dizi |
| `createdAt` | timestamp | Oluşturma zamanı |

### audit_log {#audit-log}

Güvenlikle ilgili eylemlerin günlüğü.

| Sütun | Tür | Notlar |
|---|---|---|
| `id` | uuid | Birincil anahtar |
| `userId` | uuid | users tablosuna FK |
| `action` | varchar | Eylem türü |
| `details` | jsonb | Eyleme özgü veri |
| `createdAt` | timestamp | Eylem zamanı |

### user_preferences {#user-preferences}

Kullanıcı başına arayüz durumu, tercih adına göre anahtarlanır. Panodaki sabitlenmiş araçları `PUT /api/v1/preferences` üzerinden destekler.

| Sütun | Tür | Notlar |
|---|---|---|
| `userId` | text | users tablosuna FK, silinince zincirleme silinir. `key` ile birlikte birincil anahtar |
| `key` | text | Tercih adı. `userId` ile birlikte birincil anahtar |
| `value` | jsonb | Tercih yükü |
| `updatedAt` | timestamp | Son yazma |

## Migrasyonlar {#migrations}

Şema migrasyonlarını Drizzle yönetir. Migrasyon dosyaları `apps/api/drizzle/` içinde bulunur. Geliştirme sırasında:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Üretimde bekleyen migrasyonlar başlatma sırasında otomatik olarak uygulanır.

## En düşük yetkili roller {#least-privilege-roles}

İki rol, iki iş. `DATABASE_URL` istekleri sunar ve uygulamanın tabloları üzerinde `SELECT`, `INSERT`, `UPDATE`, `DELETE` yetkilerine, bu tabloların sequence'leri üzerinde ise `USAGE` ve `SELECT` yetkilerine sahiptir. Listenin tamamı bundan ibarettir. Tablo oluşturamaz veya silemez, eklenti kuramaz, `TRUNCATE` yapamaz, `pg_authid` okuyamaz, veritabanı oluşturamaz, rolü değiştiremez ve migrasyon geçmişinin bulunduğu `drizzle` şemasına dokunamaz.

`DATABASE_MIGRATION_URL` yetkili roldür. Açılış sırasında migrasyonları çalıştırır ve çalışma zamanı rolüne yetki verir, ardından tek bir istek sunulmadan önce kapanır.

Bu ayrım SnapOtter 2.3.0 ile gelir. O sürümden itibaren depo içindeki Compose dosyaları ve hepsi bir arada imaj bu şekilde bağlanmıştır; mevcut kurulumlar da dahildir: açılışta SnapOtter çalışma zamanı rolü eksikse oluşturur, yetkileri verir, migrasyonu yapar, ardından yetkileri daha önceden var olan tablolara da yayar. Yükseltme için elle SQL gerekmez.

2.2.0 imajı yalnızca çalışma zamanı bağlantı dizesini okur ve ikinci rolü hiç oluşturmaz; bu yüzden ona ayrımı verirseniz hiç ayağa kalkmaz: uygulama günlüğü o rol için parola doğrulamasının başarısız olduğunu gösterir ve Postgres günlüğü rolün var olmadığını söyler. Bir Compose dosyasını ayrıma geçirmeden önce imajı 2.3.0 veya sonrasına yükseltin.

`DATABASE_MIGRATION_URL` boş bırakılırsa tek rolle çalışır ve `DATABASE_URL` her iki işi de ayrımdan önceki gibi yapar. Bu desteklenen bir yapılandırmadır, kullanımdan kaldırılmış değildir. Rol oluşturmanın çoğu zaman size düşmediği yönetilen Postgres'te doğru yanıt budur.

### Harici ve yönetilen Postgres {#external-and-managed-postgres}

RDS, Supabase, Cloud SQL veya kendi çalıştırdığınız herhangi bir kümede ayrım isteğe bağlıdır. Çalışma zamanı rolünü bir kez oluşturun:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Ardından SnapOtter'a, aynı ana makineye, porta ve veritabanına işaret eden iki bağlantı dizesini de verin:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Orada durun. SnapOtter yetkileri kendisi uygular ve her migrasyondan sonra yeniden uygular; böylece gelecekteki bir sürümün eklediği tablo, kimse bunun için SQL çalıştırmadan kapsanır.

`DATABASE_MIGRATION_URL` içindeki rolün SnapOtter tablolarının sahibi olması gerekir, çünkü bir tablo üzerinde yalnızca sahibi yetki verebilir. Mevcut bir kurulumda bu, SnapOtter'ı şimdiye kadar çalıştırdığınız rol demektir, bu amaçla yeni oluşturulmuş bir rol değil. Hiçbir şeye sahip olmayan yeni bir role yönlendirirseniz açılış, tam olarak bunu söyleyen bir hatayla başarısız olur. Ayrıca çalışma zamanı rolünü oluşturmak ve sürdürmek için `CREATEROLE` yetkisine ve `drizzle` şemasını oluşturma hakkına ihtiyaç duyar.

İki URL'de de aynı rolü yazarsanız ayrım kapalıdır ve SnapOtter bunu yokmuş gibi davranmak yerine günlükte belirtir. Sağlayıcınız hem tabloların sahibi olabilen hem de `CREATEROLE` yetkisini taşıyan bir rol vermiyorsa tek rolle çalıştırın.

### Süper kullanıcı bitine neden dokunulmadığı {#why-the-superuser-bit-is-left-alone}

SnapOtter hiçbir rolün `SUPERUSER` yetkisini kendi başına kaldırmaz. Ayrımdan önce oluşturulmuş bir kurulumda `snapotter` kümenin tek süper kullanıcısıdır ve onu düşürmek kümeyi hiç süper kullanıcısız bırakır; bu da yalnızca sunucu durdurulmuşken tek kullanıcı moduyla kurtarılabilir. Korumayı sağlayan şey, uzun ömürlü bağlantıyı kısıtlı role taşımaktır. Süper kullanıcı, açılışın birkaç saniyesi boyunca bağlantıda bulunur ve sonra gider.

Yeni hepsi bir arada kurulumlar bu sorunu hiç yaşamaz. Üç rol alırlar: `postgres` (başlangıç süper kullanıcısı, SnapOtter'ın kullandığı hiçbir bağlantı dizesinde yer almaz), `snapotter` (`NOSUPERUSER`, verinin sahibidir, yalnızca açılışta bağlanır) ve `snapotter_app` (yalnızca satırlar, istekleri sunar).

Eski bir `snapotter` rolünü yine de düşürmek için önce ikinci bir süper kullanıcı oluşturun ve çalıştığını doğrulamak için onunla oturum açın. Ardından `ALTER ROLE snapotter NOSUPERUSER`.

## Yedekleme ve geri yükleme {#backup-and-restore}

İlişkisel veritabanı, uygulamanın `/data` biriminde değil, Postgres konteynerinin `SnapOtter-pgdata` biriminde bulunur.

**Doğrulamalı mantıksal yedek (önerilir)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Her iki komut da sahip olan `snapotter` olarak bağlanır ve böyle yapmaya devam etmelidir. Çalışma zamanı rolü `drizzle` şemasını göremez, bu yüzden o rolle alınan bir döküm eksik çıkar. `--no-owner` geri yüklenen nesneleri geri yüklemeyi çalıştıranın sahipliğinde bırakır; bu yüzden sahip olarak çalıştırmak sahipliği yetkilerin beklediği yere koyar. Yeni bir kümede bir dikkat noktası: `pg_dump` yetkileri taşır ama adını andığı rolleri taşımaz; bu yüzden geri yüklemeden önce `snapotter_app` rolünü oluşturun, yoksa `--exit-on-error` ilk `GRANT` komutunda durur. SnapOtter ne olursa olsun yetkileri bir sonraki açılışında yeniden uygular.

Bu veritabanı dökümü `/data/files` içindeki kaydedilmiş kitaplık nesnelerini veya Redis'teki kalıcı BullMQ durumunu içermez. Bunları [Güvenlik ve Sıkılaştırma](/tr/guide/security#backup-and-recovery) bölümündeki koordineli prosedürle yedekleyin ve geri yükleyin.

**Soğuk birim anlık görüntüsü**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Çalışan bir PostgreSQL veri dizinini `tar` ile kopyalamayın. Compose birim adlarının başına proje adını ekler; bu yüzden `SnapOtter-pgdata` etiketini birebir varsaymak yerine bağlanmış birim kimliklerini `docker inspect` veya depolama platformunuzdan çözümleyin.

### 1.x'ten (SQLite) geçiş {#migrating-from-1-x-sqlite}

SnapOtter 1.x'ten yükseltmenin kendi rehberi vardır: bkz. [1.x'ten 2.0'a yükseltme](./upgrading). Kısaca, mevcut `/data` biriminizi yeniden kullanın; 2.0 ilk açılışta `/data/snapotter.db` dosyasını otomatik algılar ve içe aktarır (veya ona açıkça işaret etmek için `SQLITE_MIGRATE_PATH` ayarlayın). Önce yalnızca `snapotter.db` değil, `/data` biriminin tamamını yedekleyin: 1.x, SQLite WAL modunu kullanır; bu yüzden durdurulmuş bir konteyner verinin çoğunu, neredeyse boş bir `snapotter.db` dosyasının yanındaki `snapotter.db-wal` içinde bırakabilir.
