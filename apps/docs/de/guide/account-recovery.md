---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: 84cad1747158
i18n_hash_version: 2
---
# Kontowiederherstellung {#account-recovery}

Wenn du dich aus SnapOtter aussperrst (meist durch eine MFA-Richtlinie, die du nicht
mehr erfüllen kannst), kannst du die Wiederherstellung innerhalb des Containers ohne einen
Datenbank-Client durchführen. Die Wiederherstellungsbefehle laufen offline und erfordern Shell-Zugriff auf den Container,
was ohnehin bereits die volle Kontrolle über die Instanz bedeutet.

## Gegen welche Wand laufe ich? {#which-wall-am-i-hitting}

Die Anmeldung von SnapOtter wendet zwei unabhängige MFA-Sperren an. Stelle zuerst die Diagnose:

```bash
docker exec -it snapotter snapotter-admin status
```

Dies gibt die aktuelle MFA-Richtlinie aus und welche Benutzer TOTP eingerichtet haben.

- **"MFA-Einrichtung ist vor der Anmeldung erforderlich" (und du hast nie eine App eingerichtet):**
  Die Richtlinie erfordert MFA, aber du hast keine Einrichtung. Lockere die Richtlinie.
- **Du wirst nach einem Code gefragt, den du nicht erzeugen kannst** (Handy und
  Wiederherstellungscodes verloren): Dein Konto ist eingerichtet. Lösche diese Einrichtung.

## Die MFA-Richtlinie lockern {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Dies setzt die Richtlinie zurück auf `optional`. Sie greift bei deiner nächsten Anmeldung ohne
Neustart. Sie setzt immer nur `optional`, kann die Erzwingung also nicht wieder einschalten.

## Die TOTP-Einrichtung eines Benutzers löschen {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Wenn die Richtlinie für diesen Benutzer weiterhin MFA erfordert, läuft er als Nächstes gegen die
Einrichtungswand. Führe also auch `reset-mfa-policy` aus, melde dich an und richte es in den Einstellungen neu ein.

## Ein vergessenes Passwort zurücksetzen {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

Lässt du `[password]` weg, gibt die CLI ein generiertes temporäres Passwort aus. In beiden Fällen werden die aktiven Sitzungen, API-Schlüssel und das Sperrfenster nach fehlgeschlagenen Anmeldungen des Benutzers gelöscht, und SnapOtter verlangt bei der nächsten Anmeldung eine Passwortänderung.

## Ein Admin-Konto neu anlegen {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

Nutze dies, wenn sich kein bestehendes Admin-Konto mehr anmelden kann. `[username]` nutzt standardmäßig `DEFAULT_USERNAME` (`admin`), und das Weglassen von `[password]` gibt ein temporäres Passwort aus, das bei der ersten Anmeldung geändert werden muss.

## Einen gedrosselten oder deaktivierten Benutzer entsperren {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

Dies löscht das `LOGIN_THROTTLED`-Fenster in Redis und stellt die Rolle des Kontos wieder her, falls der Benutzer deaktiviert war.

## Ältere Images und Fallbacks {#older-images-and-fallbacks}

Auf einem Image, das erstellt wurde, bevor der `snapotter-admin`-Wrapper existierte, rufe das Skript
direkt auf:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

Als letzten Ausweg auf jeder Version setzt du die Richtlinie in der Datenbank. Auf dem
All-in-One-Image läuft Postgres innerhalb des Containers:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

Beim Setup mit mehreren Containern richtest du `psql` stattdessen auf dein eigenes `DATABASE_URL`.

## Aus SSO ausgesperrt, nicht aus MFA? {#locked-out-of-sso-not-mfa}

Wenn eine erzwungene SSO-Anmeldung fehlschlägt, nutze stattdessen das Break-Glass-Konto vor Ort:
Setze `ssoBreakGlassUsername` vor dem Erzwingen von SSO unter Einstellungen > Sicherheit auf einen lokalen Admin,
und melde dich mit dem Passwort dieses Kontos an.
