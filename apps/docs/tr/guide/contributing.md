---
description: "SnapOtter'a nasıl katkıda bulunulur. Hata bildirimleri, özellik istekleri, pull request'ler ve CLA gereksinimleri."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: bf657da309f3
---

# Katkıda Bulunma {#contributing}

Katkıda bulunmakla ilgilendiğiniz için teşekkürler. Bu kılavuz nasıl katılabileceğinizi, neleri kabul ettiğimizi ve nasıl başlayacağınızı anlatır.

## Katkı yolları {#ways-to-contribute}

### Issue'lar (kurulum gerekmez) {#issues-no-setup-required}

- **Hata bildirimleri** - Bir şey mi bozuk? Yeniden üretme adımlarıyla birlikte bir [hata bildirimi](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) açın.
- **Özellik istekleri** - Bir fikriniz mi var? Topluluğun görüş bildirebilmesi ve oy verebilmesi için bir [tartışma](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) başlatın.
- **Çeviri sorunları** - Yanlış veya eksik bir çeviri mi gördünüz? Bir [çeviri issue'su](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml) açın.
- **Dokümantasyon sorunları** - Dokümanlarda bir aksaklık mı var? Bir [dokümantasyon issue'su](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml) açın.

### Kod (CLA gerektirir) {#code-requires-cla}

Şu türde pull request'leri kabul ediyoruz:

| Tür | Süreç |
|------|---------|
| Hata düzeltmeleri | Doğrudan bir PR açın (varsa ilgili issue'ya bağlayın) |
| Yeni çeviriler | Doğrudan bir PR açın ([Çeviri Kılavuzu](/tr/guide/translations) bölümüne bakın) |
| Dokümantasyon iyileştirmeleri | Doğrudan bir PR açın |
| Test kapsamı iyileştirmeleri | Doğrudan bir PR açın |
| Yeni araçlar veya özellikler | Önce bir [tartışma](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) başlatın; bir bakımcı, onaylanan fikirleri siz kod yazmadan önce izlenen bir issue'ya dönüştürür |
| Refactor veya mimari değişiklikler | Önce bir [tartışma](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) başlatın ve kod yazmadan önce bir bakımcının onayını bekleyin |

### Kabul etmeyeceklerimiz {#what-we-will-not-accept}

- CI/CD iş akışlarında, sürüm yapılandırmasında ya da linter/derleyici yapılandırmasında değişiklikler
- İmzalanmış bir [Katkıda Bulunan Lisans Anlaşması](#contributor-license-agreement) olmayan PR'ler
- 400 satırdan fazla değişiklik içeren PR'ler (büyük çalışmaları daha küçük PR'lere bölün)
- Önceden tartışılıp onaylanmamış özellikler
- Önceden tartışmadan `packages/ai/` dosyasında yapılan değişiklikler

## Katkıda Bulunan Lisans Anlaşması {#contributor-license-agreement}

İlk PR'inizi birleştirebilmemizden önce [Bireysel CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) anlaşmamızı imzalamanız gerekir. Bu tek seferlik bir gerekliliktir.

**Neden:** SnapOtter çift lisanslıdır (AGPLv3 + ticari). CLA, katkılarınızı her iki lisans altında dağıtma hakkını bize verir. Çalışmanızın tüm telif hakkı sahipliğini korursunuz.

**Nasıl:** İlk PR'inizi açtığınızda, CLA Assistant botu bir bağlantı içeren bir yorum bırakır. Bağlantıya tıklayın, anlaşmayı inceleyin ve GitHub hesabınızla imzalayın. 30 saniye sürer.

İşvereniniz adına katkıda bulunuyorsanız ve işvereniniz çalışmanız üzerindeki fikri mülkiyet haklarını elinde tutuyorsa, göndermeden önce bir Kurumsal CLA düzenlemek için contact@snapotter.com adresine yazın.

## Başlarken {#getting-started}

### Ön koşullar {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (yalnızca AI araçları için)
- Docker (isteğe bağlı, tam entegrasyon testi için)

### Kurulum {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### Kontrolleri çalıştırma {#running-checks}

Bir PR göndermeden önce, tüm kontrollerin yerelde geçtiğinden emin olun:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Pull request süreci {#pull-request-process}

1. Repo'yu fork'layın ve `main` üzerinden bir dal oluşturun (`feat/my-feature` veya `fix/issue-123`)
2. Değişikliklerinizi [conventional commits](https://www.conventionalcommits.org/) kullanarak odaklı, incelenebilir commit'lerde yapın
3. Değişiklikleriniz için testler ekleyin ya da güncelleyin
4. `pnpm lint && pnpm typecheck && pnpm test` komutunu yerelde çalıştırın
5. `main` üzerine bir PR açın ve şablonu doldurun
6. İstenirse CLA'yı imzalayın
7. CI'nin geçmesini ve bir bakımcının incelemesini bekleyin

### İnceleme beklentileri {#review-expectations}

- PR'lere 7 gün içinde yanıt vermeyi hedefliyoruz
- Küçük, odaklı PR'ler daha hızlı incelenir
- 7 gün içinde bir yanıt almadıysanız, konu başlığına bir yorum bırakıp bildirin
- Değişiklik isteyebilir, farklı bir yaklaşım önerebilir ya da PR projenin yönüyle uyumlu değilse kapatabiliriz

### PR'iniz birleştirildikten sonra {#after-your-pr-is-merged}

Katkınız bir sonraki sürüme dahil edilir ve değişiklik günlüğünde size atıfta bulunulur.

## İyi ilk issue'lar {#good-first-issues}

Üzerinde çalışacak bir şey mi arıyorsunuz? Yeni başlayanlar için uygun görevler için [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) listesine, ya da topluluk yardımından memnun olacağımız daha büyük işler için [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) listesine göz atın.

## Kod stili {#code-style}

- Biome biçimlendirme ve lint işini yürütür (çift tırnak, noktalı virgül, 2 boşluk girinti)
- Commit öncesi hook, staged dosyalarda `biome check --write` komutunu otomatik olarak çalıştırır
- Linter şikayet ederse, kodu düzeltin (Biome yapılandırmasını değiştirmeyin)
- Her yerde ES modülleri (`import`/`export`)
- Conventional commit'ler: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Tam mimari ayrıntıları için [Geliştirici Kılavuzu](/tr/guide/developer) bölümüne bakın.

## Güvenlik {#security}

**Güvenlik açıkları için herkese açık bir PR ya da issue açmayın.** Bunları [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) üzerinden ya da contact@snapotter.com adresine e-posta yoluyla özel olarak bildirin. Tüm ayrıntılar için [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) dosyasına bakın.

## Sorularınız mı var? {#questions}

- [Dokümantasyon](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
