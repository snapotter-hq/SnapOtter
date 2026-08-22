---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: 572c4343a83f
i18n_hash_version: 2
---
# Kontoåterställning {#account-recovery}

Om du blir utelåst från SnapOtter (oftast av en MFA-policy som du inte längre
kan uppfylla) kan du återställa åtkomsten inifrån containern utan en
databasklient. Återställningskommandona är offline och kräver skalåtkomst till
containern, vilket redan innebär full kontroll över instansen.

## Vilken vägg går jag in i? {#which-wall-am-i-hitting}

SnapOtters inloggning tillämpar två oberoende MFA-grindar. Diagnostisera först:

```bash
docker exec -it snapotter snapotter-admin status
```

Detta skriver ut den aktuella MFA-policyn och vilka användare som har TOTP registrerat.

- **"MFA enrollment is required before login" (och du har aldrig ställt in en app):**
  policyn kräver MFA men du har ingen registrering. Mildra policyn.
- **Du ombeds ange en kod som du inte kan producera** (du har tappat bort din telefon och dina
  återställningskoder): ditt konto är registrerat. Rensa den registreringen.

## Mildra MFA-policyn {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Detta återställer policyn till `optional`. Den träder i kraft vid din nästa inloggning utan
omstart. Den sätter bara någonsin `optional`, så den kan inte slå på tvingande läge igen.

## Rensa en användares TOTP-registrering {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Om policyn fortfarande kräver MFA för den användaren stöter de på registrerings-
väggen härnäst, så kör även `reset-mfa-policy`, logga in och registrera på nytt från Inställningar.

## Äldre avbildningar och reservlösningar {#older-images-and-fallbacks}

På en avbildning som byggdes innan omslaget `snapotter-admin` fanns anropar du skriptet
direkt:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

Som en sista utväg på vilken version som helst kan du sätta policyn i databasen. På
allt-i-ett-avbildningen körs Postgres inuti containern:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

I upplägget med flera containrar pekar du `psql` mot din egen `DATABASE_URL` i stället.

## Utelåst från SSO, inte MFA? {#locked-out-of-sso-not-mfa}

Om en tvingande SSO-inloggning misslyckas använder du i stället det lokala nödåtkomstkontot:
sätt `ssoBreakGlassUsername` till en lokal administratör under Inställningar > Säkerhet innan du
tvingar SSO, och logga in med det kontots lösenord.
