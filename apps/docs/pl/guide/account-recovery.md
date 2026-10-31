---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: b00c9caa7ae3
i18n_hash_version: 2
---
# Odzyskiwanie dostępu do konta {#account-recovery}

Jeśli stracisz dostęp do SnapOtter (najczęściej z powodu zasady MFA, której już
nie da się spełnić), możesz odzyskać dostęp z wnętrza kontenera bez klienta bazy
danych. Polecenia odzyskiwania działają offline i wymagają dostępu do powłoki
kontenera, co i tak oznacza pełną kontrolę nad instancją.

## Na którą ścianę trafiam? {#which-wall-am-i-hitting}

Logowanie w SnapOtter stosuje dwie niezależne bramki MFA. Najpierw postaw diagnozę:

```bash
docker exec -it snapotter snapotter-admin status
```

Wyświetla to bieżącą zasadę MFA oraz to, którzy użytkownicy mają zarejestrowany TOTP.

- **"MFA enrollment is required before login" (a nigdy nie skonfigurowałeś aplikacji):**
  zasada wymaga MFA, ale nie masz żadnej rejestracji. Poluzuj zasadę.
- **Zostajesz poproszony o kod, którego nie potrafisz wygenerować** (zgubiłeś telefon i
  swoje kody odzyskiwania): Twoje konto jest zarejestrowane. Usuń tę rejestrację.

## Poluzuj zasadę MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Ustawia to zasadę z powrotem na `optional`. Zaczyna obowiązywać przy następnym logowaniu bez
restartu. Ustawia zawsze tylko `optional`, więc nie może z powrotem włączyć wymuszania.

## Usuń rejestrację TOTP jednego użytkownika {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Jeśli zasada nadal wymaga MFA dla tego użytkownika, przy następnym razie trafi on na
ścianę rejestracji, więc uruchom też `reset-mfa-policy`, zaloguj się i zarejestruj ponownie z poziomu Ustawień.

## Zresetuj zapomniane hasło {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

Pomiń `[password]`, a CLI wyświetli wygenerowane hasło tymczasowe. W obu przypadkach aktywne sesje użytkownika, klucze API oraz okno blokady po nieudanych logowaniach zostają wyczyszczone, a SnapOtter wymusi zmianę hasła przy kolejnym logowaniu.

## Utwórz początkowe konto administratora {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

Użyj tego polecenia, gdy żadne istniejące konto administratora nie może się zalogować. `[username]` domyślnie przyjmuje wartość `DEFAULT_USERNAME` (`admin`), a pominięcie `[password]` wyświetla hasło tymczasowe, które trzeba zmienić przy pierwszym logowaniu.

## Odblokuj ograniczonego lub wyłączonego użytkownika {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

Czyści to okno `LOGIN_THROTTLED` w Redisie i przywraca rolę konta, jeśli użytkownik był wyłączony.

## Starsze obrazy i rozwiązania awaryjne {#older-images-and-fallbacks}

Na obrazie zbudowanym zanim powstała nakładka `snapotter-admin`, wywołaj skrypt
bezpośrednio:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

W ostateczności, w dowolnej wersji, ustaw zasadę w bazie danych. Na obrazie
all-in-one Postgres działa wewnątrz kontenera:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

W konfiguracji wielokontenerowej wskaż zamiast tego `psql` na własny `DATABASE_URL`.

## Zablokowany dostęp do SSO, a nie MFA? {#locked-out-of-sso-not-mfa}

Jeśli wymuszone logowanie SSO zawodzi, użyj zamiast tego lokalnego konta awaryjnego:
ustaw `ssoBreakGlassUsername` na lokalnego administratora w Ustawienia > Bezpieczeństwo, zanim
wymusisz SSO, i zaloguj się przy użyciu hasła tego konta.
