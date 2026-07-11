---
description: "Richten Sie Single Sign-On mit OpenID Connect ein. Schritt-für-Schritt-Anleitungen für Keycloak, Authentik, Google und andere OIDC-Anbieter."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 8f5a0caeda80
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter unterstützt OpenID Connect (OIDC) für Single Sign-On. Benutzer können sich mit einem externen Identitätsanbieter wie Keycloak, Authentik oder Google anmelden, anstatt (oder zusätzlich zu) der lokalen Benutzername/Passwort-Authentifizierung.

::: tip Siehe auch
[SAML SSO](/de/guide/saml) | [SCIM-Bereitstellung](/de/guide/scim) | [Benutzer, Rollen & Berechtigungen](/de/guide/users-roles)
:::

## Schnellstart {#quick-start}

Fügen Sie diese Umgebungsvariablen zu Ihrer `docker-compose.yml` hinzu:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

Die Weiterleitungs-URI für Ihren Anbieter lautet immer:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Wenn `EXTERNAL_URL` beispielsweise `https://photos.example.com` ist, konfigurieren Sie die Weiterleitungs-URI Ihres Anbieters als `https://photos.example.com/api/auth/oidc/callback`.

## Konfigurationsreferenz {#configuration-reference}

| Variable | Standard | Beschreibung |
|---|---|---|
| `OIDC_ENABLED` | `false` | OIDC-Anmeldung aktivieren. Eine Schaltfläche "Mit SSO anmelden" erscheint auf der Anmeldeseite. |
| `OIDC_ISSUER_URL` | | Issuer-URL des Anbieters. Muss OIDC Discovery (`/.well-known/openid-configuration`) unterstützen. |
| `OIDC_CLIENT_ID` | | Bei Ihrem Anbieter registrierte OAuth-Client-ID. |
| `OIDC_CLIENT_SECRET` | | OAuth-Client-Secret. |
| `OIDC_SCOPES` | `openid profile email` | Durch Leerzeichen getrennte Liste der anzufordernden Scopes. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Bei der ersten OIDC-Anmeldung automatisch ein lokales Benutzerkonto erstellen. |
| `OIDC_DEFAULT_ROLE` | `user` | Rolle, die automatisch erstellten OIDC-Benutzern zugewiesen wird. Eine von `admin`, `editor` oder `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Eine OIDC-Identität mit einem bestehenden lokalen Benutzer verknüpfen, wenn die E-Mail-Adresse übereinstimmt. |
| `OIDC_PROVIDER_NAME` | | Auf der Anmeldeschaltfläche angezeigter Anzeigename (z. B. "Keycloak", "Google"). Wenn leer, zeigt die Schaltfläche "SSO" an. |
| `OIDC_CLOCK_TOLERANCE` | `30` | Toleranz für Uhrenabweichungen in Sekunden bei der Token-Validierung. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | ID-Token-Claim, der als Benutzername für neue Konten verwendet wird. |
| `EXTERNAL_URL` | | Die öffentliche URL, unter der SnapOtter erreichbar ist. Erforderlich, damit OIDC die korrekte Weiterleitungs-URI erstellen kann. |
| `COOKIE_SECRET` | automatisch generiert | Secret zum Signieren von Sitzungscookies. Setzen Sie dies explizit, wenn Sie mehrere Replikate betreiben. |

## Anbieter-Anleitungen {#provider-guides}

### Keycloak {#keycloak}

1. Erstellen Sie einen neuen Realm (oder verwenden Sie einen bestehenden).
2. Gehen Sie zu **Clients** und erstellen Sie einen neuen Client:
   - **Client-ID**: `snapotter`
   - **Client-Authentifizierung**: An (vertraulich)
   - **Authentifizierungsablauf**: Standard-Flow (Authorization Code)
3. Setzen Sie auf der Registerkarte **Settings** des Clients unter **Valid redirect URIs** Ihre Callback-URL (z. B. `https://photos.example.com/api/auth/oidc/callback`).
4. Kopieren Sie das **Client secret** von der Registerkarte **Credentials**.
5. Setzen Sie `OIDC_ISSUER_URL` auf `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. Gehen Sie in der Admin-Oberfläche zu **Applications > Providers** und erstellen Sie einen neuen **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: Ihre Callback-URL
   - **Signing key**: Wählen Sie einen bestehenden Schlüssel oder erstellen Sie einen
2. Erstellen Sie eine **Application** und verknüpfen Sie sie mit dem Provider.
3. Kopieren Sie die **Client ID** und das **Client Secret** aus den Provider-Einstellungen.
4. Setzen Sie `OIDC_ISSUER_URL` auf `https://authentik.example.com/application/o/snapotter/` (der abschließende Schrägstrich ist wichtig).

### Google {#google}

1. Gehen Sie zur [Google Cloud Console](https://console.cloud.google.com/).
2. Erstellen Sie ein Projekt (oder wählen Sie ein bestehendes).
3. Navigieren Sie zu **APIs & Services > OAuth consent screen** und konfigurieren Sie ihn.
4. Gehen Sie zu **APIs & Services > Credentials** und erstellen Sie eine **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Ihre Callback-URL
5. Kopieren Sie die **Client ID** und das **Client secret**.
6. Setzen Sie `OIDC_ISSUER_URL` auf `https://accounts.google.com`.
7. Setzen Sie `OIDC_USERNAME_CLAIM` auf `email` (Google stellt `preferred_username` nicht bereit).

## Benutzerbereitstellung {#user-provisioning}

### Automatisches Erstellen {#auto-create}

Wenn `OIDC_AUTO_CREATE_USERS` auf `true` (die Voreinstellung) steht, wird beim ersten Anmelden per OIDC ein lokales Benutzerkonto erstellt. Der Benutzername wird aus dem durch `OIDC_USERNAME_CLAIM` angegebenen Claim übernommen, und die Rolle wird auf `OIDC_DEFAULT_ROLE` gesetzt.

Bei einer Kollision des Benutzernamens wird ein numerisches Suffix angehängt (z. B. `jane` wird zu `jane_2`).

### Automatisches Verknüpfen {#auto-link}

Wenn `OIDC_AUTO_LINK_USERS` auf `true` steht, verknüpft SnapOtter eine OIDC-Identität mit einem bestehenden lokalen Konto, wenn die E-Mail-Adressen übereinstimmen. Das ist nützlich, wenn Sie Benutzerkonten vorab erstellt haben und möchten, dass diese SSO nutzen, ohne ihre Daten zu verlieren.

::: warning 
Aktivieren Sie das automatische Verknüpfen nur, wenn Sie Ihrem OIDC-Anbieter zutrauen, E-Mail-Adressen zu verifizieren. Eine nicht verifizierte E-Mail könnte es jemandem ermöglichen, das Konto eines anderen Benutzers zu übernehmen.
:::

### Lokale Anmeldung deaktivieren {#disabling-local-login}

OIDC deaktiviert die lokale Benutzername/Passwort-Anmeldung nicht. Beide Methoden bleiben verfügbar. Admins können sich weiterhin mit lokalen Anmeldedaten anmelden, falls der OIDC-Anbieter nicht erreichbar ist.

## Selbstsignierte Zertifikate {#self-signed-certificates}

Wenn Ihr OIDC-Anbieter ein selbstsigniertes oder privates CA-Zertifikat verwendet, binden Sie das CA-Bundle in den Container ein und verweisen Sie `NODE_EXTRA_CA_CERTS` darauf:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
Setzen Sie `NODE_TLS_REJECT_UNAUTHORIZED=0` nicht. Dies deaktiviert die gesamte TLS-Verifizierung und ist ein Sicherheitsrisiko.
:::

## Fehlerbehebung {#troubleshooting}

### Nichtübereinstimmung der Weiterleitungs-URI {#redirect-uri-mismatch}

Der häufigste Fehler. Prüfen Sie diese Unterschiede zwischen dem, was Ihr Anbieter erwartet, und dem, was SnapOtter sendet:

- `http` vs. `https` - das Schema muss exakt übereinstimmen
- Abschließender Schrägstrich - manche Anbieter sind hierbei streng
- Portnummer - geben Sie den Port an, wenn er nicht dem Standard entspricht
- Pfad - muss `/api/auth/oidc/callback` sein

Überprüfen Sie `EXTERNAL_URL` genau. Es muss mit der URL übereinstimmen, die Benutzer in ihren Browser eingeben.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

Der OIDC-Anbieter verwendet ein Zertifikat, dem Node.js nicht vertraut. Siehe [Selbstsignierte Zertifikate](#self-signed-certificates) oben.

### Fehler durch Uhrenabweichung {#clock-skew-errors}

Wenn die Uhr Ihres Servers und die Uhr des OIDC-Anbieters nicht synchron sind, kann die Token-Validierung fehlschlagen. Erhöhen Sie `OIDC_CLOCK_TOLERANCE` (Standard ist 30 Sekunden). Eine bessere Lösung ist, NTP auf beiden Maschinen auszuführen.

### "OIDC-Anbieter nicht erreichbar" {#oidc-provider-unreachable}

SnapOtter ruft das Discovery-Dokument des Anbieters beim Start und während der Anmeldung ab. Prüfen Sie:

- DNS-Auflösung aus dem Inneren des Docker-Containers (`docker exec snapotter nslookup auth.example.com`)
- Firewall-Regeln zwischen dem Container und dem Anbieter
- Den Wert `OIDC_ISSUER_URL` - er muss vom Server aus erreichbar sein, nicht nur von Ihrem Browser

### Fehlende Claims {#missing-claims}

Wenn Benutzernamen oder E-Mails nach der Anmeldung leer sind, gibt Ihr Anbieter möglicherweise nicht die erwarteten Claims zurück. Überprüfen Sie:

- Die in `OIDC_SCOPES` konfigurierten Scopes enthalten `profile` und `email`
- Der Anbieter ist so konfiguriert, dass er den in `OIDC_USERNAME_CLAIM` angegebenen Claim in das ID-Token aufnimmt
- Manche Anbieter erfordern eine explizite Mapper-/Scope-Konfiguration, um Claims freizugeben
