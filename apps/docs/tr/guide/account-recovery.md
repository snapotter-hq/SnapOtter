---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: 20bca441456c
i18n_hash_version: 2
---
# Hesap Kurtarma {#account-recovery}

SnapOtter'a erişiminizi kaybederseniz (çoğunlukla artık karşılayamadığınız bir
MFA politikası yüzünden), bir veritabanı istemcisine gerek kalmadan kapsayıcının
içinden kurtarma yapabilirsiniz. Kurtarma komutları çevrimdışıdır ve kapsayıcıya
kabuk erişimi gerektirir; bu zaten örnek üzerinde tam denetim anlamına gelir.

## Hangi duvara toslıyorum? {#which-wall-am-i-hitting}

SnapOtter'ın oturum açması iki bağımsız MFA kapısı uygular. Önce teşhis edin:

```bash
docker exec -it snapotter snapotter-admin status
```

Bu, geçerli MFA politikasını ve hangi kullanıcıların TOTP kaydı olduğunu yazdırır.

- **"Oturum açmadan önce MFA kaydı gereklidir" (ve hiç bir uygulama kurmadınız):**
  politika MFA gerektiriyor ancak kaydınız yok. Politikayı gevşetin.
- **Üretemeyeceğiniz bir kod isteniyor** (telefonunuzu ve kurtarma kodlarınızı
  kaybettiniz): hesabınız kayıtlı. O kaydı temizleyin.

## MFA politikasını gevşetin {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Bu, politikayı `optional` değerine döndürür ve yeniden başlatmadan bir sonraki oturumda geçerli olur.
Yalnızca `optional` ayarladığından, zorunlu tutmayı yeniden açamaz.

## Bir kullanıcının TOTP kaydını temizleyin {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Politika o kullanıcı için hâlâ MFA gerektiriyorsa, sonraki adımda kayıt duvarına toslar;
bu yüzden `reset-mfa-policy` komutunu da çalıştırın, oturum açıp Ayarlar'dan yeniden kayıt olun.

## Eski görüntüler ve yedek yöntemler {#older-images-and-fallbacks}

`snapotter-admin` sarmalayıcısı var olmadan önce derlenmiş bir görüntüde betiği doğrudan
çağırın:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

Herhangi bir sürümde son çare olarak, politikayı veritabanında ayarlayın.
Hepsi bir arada görüntüde Postgres kapsayıcının içinde çalışır:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

Çok kapsayıcılı kurulumda ise `psql` değerini kendi `DATABASE_URL` örneğinize yöneltin.

## MFA değil de SSO'dan mı kilitlendiniz? {#locked-out-of-sso-not-mfa}

Zorunlu bir SSO oturum açma başarısız oluyorsa, bunun yerine acil durum yerel
hesabını kullanın: SSO'yu zorunlu kılmadan önce Ayarlar > Güvenlik altında bir
yerel yönetici için `ssoBreakGlassUsername` ayarını yapın ve o hesabın parolasıyla oturum açın.
