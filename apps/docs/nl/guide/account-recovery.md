---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: 8e8e5779f979
i18n_hash_version: 2
---
# Accountherstel {#account-recovery}

Als je buitengesloten raakt van SnapOtter (meestal door een MFA-beleid waaraan je
niet langer kunt voldoen), kun je herstellen vanuit de container zonder een
databaseclient. Herstelcommando's werken offline en vereisen shell-toegang tot de container,
wat sowieso al volledige controle over het exemplaar betekent.

## Tegen welke muur loop ik aan? {#which-wall-am-i-hitting}

De login van SnapOtter past twee onafhankelijke MFA-poorten toe. Stel eerst een diagnose:

```bash
docker exec -it snapotter snapotter-admin status
```

Dit toont het huidige MFA-beleid en welke gebruikers TOTP hebben ingesteld.

- **"MFA-inschrijving is vereist vóór het inloggen" (en je hebt nooit een app ingesteld):**
  het beleid vereist MFA, maar je hebt geen inschrijving. Versoepel het beleid.
- **Er wordt gevraagd om een code die je niet kunt produceren** (je telefoon en je
  herstelcodes kwijt): je account is ingeschreven. Wis die inschrijving.

## Versoepel het MFA-beleid {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Dit zet het beleid terug op `optional`. Het wordt van kracht bij je volgende login zonder
herstart. Het stelt alleen ooit `optional` in, dus het kan handhaving niet weer inschakelen.

## Wis de TOTP-inschrijving van één gebruiker {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Als het beleid nog steeds MFA vereist voor die gebruiker, loopt die vervolgens tegen de
inschrijvingsmuur aan, dus voer ook `reset-mfa-policy` uit, log in en schrijf je opnieuw in vanuit Instellingen.

## Stel een vergeten wachtwoord opnieuw in {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

Laat `[password]` weg en de CLI toont een gegenereerd tijdelijk wachtwoord. In beide gevallen worden de actieve sessies, API-sleutels en het blokkadevenster na mislukte aanmeldingen van de gebruiker gewist, en vereist SnapOtter een wachtwoordwijziging bij de volgende login.

## Maak een nieuw beheerdersaccount aan {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

Gebruik dit wanneer geen enkel bestaand beheerdersaccount kan inloggen. `[username]` gebruikt standaard `DEFAULT_USERNAME` (`admin`), en het weglaten van `[password]` toont een tijdelijk wachtwoord dat bij de eerste login moet worden gewijzigd.

## Deblokkeer een beperkte of uitgeschakelde gebruiker {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

Dit wist het `LOGIN_THROTTLED`-venster in Redis en herstelt de rol van het account als de gebruiker was uitgeschakeld.

## Oudere images en fallbacks {#older-images-and-fallbacks}

Op een image die is gebouwd vóórdat de `snapotter-admin`-wrapper bestond, roep je het script
rechtstreeks aan:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

Als laatste redmiddel op elke versie stel je het beleid in de database in. Op de
all-in-one-image draait Postgres in de container:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

Bij de opstelling met meerdere containers wijs je `psql` in plaats daarvan naar je eigen `DATABASE_URL`.

## Buitengesloten van SSO, niet van MFA? {#locked-out-of-sso-not-mfa}

Als een afgedwongen SSO-login mislukt, gebruik dan in plaats daarvan het lokale break-glass-account:
stel `ssoBreakGlassUsername` in op een lokale beheerder onder Instellingen > Beveiliging voordat je
SSO afdwingt, en log in met het wachtwoord van dat account.
