---
description: "SnapOtter için PostgreSQL veritabanı şeması, tablolar, migration'lar ve yedekleme prosedürleri."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 635a49df1d8b
i18n_hash_version: 2
---

# Veritabanı {#database}

SnapOtter, veri kalıcılığı için [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) ile birlikte PostgreSQL 17 kullanır. Şema `apps/api/src/db/schema.ts` dosyasında tanımlanır.

Bağlantı, `DATABASE_URL` ortam değişkeni üzerinden yapılandırılır (varsayılan `postgres://snapotter:snapotter@postgres:5432/snapotter`). Docker Compose'da, Postgres container'ı verilerini `SnapOtter-pgdata` adlı volume'da saklar. İstekler, yalnızca satır okuyup yazabilen bir rol üzerinden karşılanır; bu konu aşağıdaki [En az ayrıcalıklı roller](#least-privilege-roles) bölümünde ele alınmıştır.

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

Kalıcı dosya kütüphanesi. Kaydedilen bir düzenleme, varsayılan olarak bağımsız bir kök satır olarak eklenir ("yeni olarak kaydet": `version` 1, `parentId` null, böylece özgün dosya listede kalır) veya özgün dosyanın üzerine yazdığınızda üst öğeye bağlı bir sürüm olarak eklenir (`parentId` ayarlanır, `version` artırılır ve onun yerini alır). `toolChain` sütunu, uygulanan araçları kaydeder.

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

### user_preferences {#user-preferences}

Kullanıcı başına arayüz durumu, tercih adına göre anahtarlanır. Ana sayfadaki sabitlenmiş araçları saklar; bunlar `PUT /api/v1/preferences` üzerinden yazılır.

| Sütun | Tür | Notlar |
|---|---|---|
| `userId` | text | users tablosuna FK, silmede CASCADE. `key` ile birlikte birincil anahtar |
| `key` | text | Tercihin adı. `userId` ile birlikte birincil anahtar |
| `value` | jsonb | Tercihin içeriği |
| `updatedAt` | timestamp | Son yazma zamanı |

## Migration'lar {#migrations}

Şema migration'larını Drizzle yürütür. Migration dosyaları `apps/api/drizzle/` dizininde bulunur. Geliştirme sırasında:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Üretimde, bekleyen migration'lar başlatma sırasında otomatik olarak uygulanır.

## En az ayrıcalıklı roller {#least-privilege-roles}

İki rol, iki görev. `DATABASE_URL` istekleri karşılar ve uygulamanın tabloları üzerinde `SELECT`, `INSERT`, `UPDATE`, `DELETE`, bunların sequence'ları üzerinde de `USAGE` ve `SELECT` yetkilerini taşır. Listenin tamamı bu. Tablo oluşturamaz veya silemez, uzantı kuramaz, `TRUNCATE` yapamaz, `pg_authid` içeriğini okuyamaz, veritabanı oluşturamaz, rol değiştiremez ve migration geçmişinin bulunduğu `drizzle` şemasına dokunamaz.

Ayrıcalıklı olan `DATABASE_MIGRATION_URL` değişkenidir. Başlatma sırasında migration'ları çalıştırır ve çalışma zamanı rolüne yetkileri verir, ardından tek bir istek bile karşılanmadan kapanır.

Compose ve hepsi bir arada imaj, mevcut kurulumlar dahil olmak üzere zaten bu şekilde yapılandırılmıştır. SnapOtter, açılışta çalışma zamanı rolü yoksa onu oluşturur, yetkilerini verir, migration'ları uygular ve ardından daha önceden var olan tablolara da bu yetkileri işler. Yükseltme için elle SQL çalıştırmak gerekmez.

`DATABASE_MIGRATION_URL` değerini boş bırakırsanız tek rolle çalışılır ve `DATABASE_URL` ayrımdan önce olduğu gibi her iki görevi de üstlenir. Bu, kullanımdan kaldırılmış değil, desteklenen bir yapılandırmadır. Rol oluşturmanın çoğu zaman sizin elinizde olmadığı yönetilen Postgres hizmetlerinde de doğru seçenek budur.

### Harici ve yönetilen Postgres {#external-and-managed-postgres}

RDS, Supabase, Cloud SQL ya da kendi işlettiğiniz herhangi bir kümede bu ayrım isteğe bağlıdır. Çalışma zamanı rolünü bir kez oluşturun:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Ardından aynı sunucuyu, portu ve veritabanını gösteren her iki bağlantı dizesini de SnapOtter'a verin:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Bu kadarı yeterli. Yetkileri SnapOtter kendisi uygular ve her migration'dan sonra yeniden verir; böylece ileriki bir sürümde eklenen bir tablo, kimse onun için SQL çalıştırmadan kapsama girer.

`DATABASE_MIGRATION_URL` içindeki rolün SnapOtter tablolarının sahibi olması gerekir, çünkü bir tablo üzerinde yalnızca sahibi yetki verebilir. Mevcut bir kurulumda bu, SnapOtter'ı o güne dek çalıştırdığınız roldür; bu iş için yeni açılmış bir rol değil. Hiçbir şeyin sahibi olmayan yeni bir rolü gösterirseniz açılış tam olarak bunu söyleyen bir hatayla başarısız olur. Ayrıca çalışma zamanı rolünü oluşturup sürdürebilmek için `CREATEROLE` yetkisine ve `drizzle` şemasını oluşturma hakkına ihtiyaç duyar.

Her iki URL'de aynı rolü yazarsanız ayrım devre dışı kalır ve SnapOtter bunu gizlemek yerine günlüğe düşer. Sağlayıcınız size hem tabloların sahibi olabilen hem de `CREATEROLE` yetkisi taşıyan bir rol vermiyorsa tek rolle çalıştırın.

### Superuser bitine neden dokunulmuyor {#why-the-superuser-bit-is-left-alone}

SnapOtter, bir rolden `SUPERUSER` yetkisini kendiliğinden asla almaz. Ayrımdan önce oluşturulmuş bir kurulumda `snapotter`, kümenin tek superuser'ıdır; bu yetkiyi düşürmek kümeyi hiç superuser'sız bırakır ve bu durumdan ancak sunucu durdurulup tek kullanıcılı kipe geçilerek dönülebilir. Korumayı bunun yerine uzun ömürlü bağlantının kısıtlı role taşınması sağlar. Superuser yalnızca açılışın birkaç saniyesi boyunca hatta olur, sonra çekilir.

Sıfırdan kurulan hepsi bir arada kurulumlarda bu sorun hiç yaşanmaz. Bunlarda üç rol bulunur: `postgres` (önyükleme superuser'ı, SnapOtter'ın kullandığı hiçbir bağlantı dizesinde yer almaz), `snapotter` (`NOSUPERUSER`, verinin sahibidir, yalnızca açılışta bağlanır) ve `snapotter_app` (yalnızca satırlar, istekleri karşılar).

Eski bir `snapotter` rolünün yetkisini yine de düşürmek isterseniz önce ikinci bir superuser oluşturun ve çalıştığını doğrulamak için onunla oturum açın. Sonra `ALTER ROLE snapotter NOSUPERUSER` komutunu verin.

## Yedekleme ve geri yükleme {#backup-and-restore}

İlişkisel veritabanı, uygulamanın `/data` biriminde değil, Postgres kapsayıcısının `SnapOtter-pgdata` biriminde bulunur.

**Doğrulama ile mantıksal yedekleme (önerilir)**

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

Her iki komut da sahip olan `snapotter` rolüyle bağlanır ve böyle kalmalıdır. Çalışma zamanı rolü `drizzle` şemasını göremediği için o rolle alınan bir döküm eksik çıkar. `--no-owner`, geri yüklenen nesnelerin sahipliğini geri yüklemeyi çalıştıran kişiye bırakır; komutu sahiple çalıştırmak da sahipliği yetkilerin beklediği yere koyar. Sıfırdan bir kümede tek bir püf noktası var: `pg_dump` yetkileri taşır ama bunların adını verdiği rolleri taşımaz, bu yüzden geri yüklemeden önce `snapotter_app` rolünü oluşturun; yoksa `--exit-on-error` ilk `GRANT` komutunda durur. SnapOtter yine de bir sonraki açılışta yetkileri yeniden uygular.

Bu veritabanı dökümü, `/data/files`'de veya Redis'te dayanıklı BullMQ durumunda kaydedilmiş kitaplık nesnelerini içermiyor. Bunları [Güvenlik ve Güçlendirme](/tr/guide/security#backup-and-recovery) bölümündeki koordineli prosedürle yedekleyin ve geri yükleyin.

**Soğuk hacim anlık görüntüsü**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Canlı bir PostgreSQL veri dizinini `tar` ile kopyalamayın. Ön ek birim adlarını projeye göre oluşturun; bu nedenle, `SnapOtter-pgdata` değişmez etiketini varsaymak yerine, bağlı birim kimliklerini `docker inspect`'den veya depolama platformunuzdan çözümleyin.

### 1.x'ten (SQLite) geçiş {#migrating-from-1-x-sqlite}

SnapOtter 1.x'ten yükseltmenin kendi kılavuzu vardır: bkz. [1.x'ten 2.0'a Yükseltme](./upgrading). Kısacası, mevcut `/data` volume'unuzu yeniden kullanın; 2.0 ilk açılışta `/data/snapotter.db` dosyasını otomatik olarak algılayıp içe aktarır (ya da ona açıkça işaret etmesi için `SQLITE_MIGRATE_PATH` değerini ayarlayın). Önce yalnızca `snapotter.db` dosyasını değil, tüm `/data` volume'unu yedekleyin: 1.x SQLite WAL modunu kullanır, bu yüzden durdurulmuş bir container genellikle verilerinin çoğunu neredeyse boş bir `snapotter.db` dosyasının yanındaki `snapotter.db-wal` dosyasında bırakır.
