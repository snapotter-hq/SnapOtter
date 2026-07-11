---
description: "Configurez l'authentification unique avec OpenID Connect. Guides étape par étape pour Keycloak, Authentik, Google et d'autres fournisseurs OIDC."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 6a7d713e4701
---

# OIDC / Authentification unique {#oidc-single-sign-on}

SnapOtter prend en charge OpenID Connect (OIDC) pour l'authentification unique. Les utilisateurs peuvent se connecter avec un fournisseur d'identité externe tel que Keycloak, Authentik ou Google au lieu de (ou en plus de) l'authentification locale par nom d'utilisateur/mot de passe.

::: tip Voir aussi
[SAML SSO](/fr/guide/saml) | [Provisionnement SCIM](/fr/guide/scim) | [Utilisateurs, rôles et permissions](/fr/guide/users-roles)
:::

## Démarrage rapide {#quick-start}

Ajoutez ces variables d'environnement à votre `docker-compose.yml` :

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

L'URI de redirection pour votre fournisseur est toujours :

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Par exemple, si `EXTERNAL_URL` est `https://photos.example.com`, configurez l'URI de redirection de votre fournisseur comme `https://photos.example.com/api/auth/oidc/callback`.

## Référence de configuration {#configuration-reference}

| Variable | Par défaut | Description |
|---|---|---|
| `OIDC_ENABLED` | `false` | Active la connexion OIDC. Un bouton « Se connecter avec SSO » apparaît sur la page de connexion. |
| `OIDC_ISSUER_URL` | | URL de l'émetteur du fournisseur. Doit prendre en charge la découverte OIDC (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | ID client OAuth enregistré auprès de votre fournisseur. |
| `OIDC_CLIENT_SECRET` | | Secret client OAuth. |
| `OIDC_SCOPES` | `openid profile email` | Liste de portées à demander, séparées par des espaces. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Créer automatiquement un compte utilisateur local lors de la première connexion OIDC. |
| `OIDC_DEFAULT_ROLE` | `user` | Rôle attribué aux utilisateurs OIDC créés automatiquement. Parmi `admin`, `editor` ou `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Lie une identité OIDC à un utilisateur local existant si l'adresse e-mail correspond. |
| `OIDC_PROVIDER_NAME` | | Nom d'affichage indiqué sur le bouton de connexion (par ex. « Keycloak », « Google »). Si vide, le bouton indique « SSO ». |
| `OIDC_CLOCK_TOLERANCE` | `30` | Tolérance de décalage d'horloge en secondes pour la validation des jetons. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Revendication du jeton d'ID utilisée comme nom d'utilisateur pour les nouveaux comptes. |
| `EXTERNAL_URL` | | L'URL publique où SnapOtter est accessible. Requise pour qu'OIDC construise l'URI de redirection correct. |
| `COOKIE_SECRET` | généré automatiquement | Secret pour signer les cookies de session. Définissez-le explicitement lorsque vous exécutez plusieurs réplicas. |

## Guides des fournisseurs {#provider-guides}

### Keycloak {#keycloak}

1. Créez un nouveau realm (ou utilisez-en un existant).
2. Allez dans **Clients** et créez un nouveau client :
   - **Client ID** : `snapotter`
   - **Client authentication** : On (confidentiel)
   - **Authentication flow** : Standard flow (Authorization Code)
3. Sous l'onglet **Settings** du client, définissez **Valid redirect URIs** sur votre URL de rappel (par ex. `https://photos.example.com/api/auth/oidc/callback`).
4. Copiez le **Client secret** depuis l'onglet **Credentials**.
5. Définissez `OIDC_ISSUER_URL` sur `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. Dans l'interface d'administration, allez dans **Applications > Providers** et créez un nouveau **OAuth2/OpenID Provider**.
   - **Client type** : Confidential
   - **Redirect URIs** : Votre URL de rappel
   - **Signing key** : Sélectionnez une clé existante ou créez-en une
2. Créez une **Application** et liez-la au fournisseur.
3. Copiez le **Client ID** et le **Client Secret** depuis les paramètres du fournisseur.
4. Définissez `OIDC_ISSUER_URL` sur `https://authentik.example.com/application/o/snapotter/` (la barre oblique finale a son importance).

### Google {#google}

1. Allez sur la [Google Cloud Console](https://console.cloud.google.com/).
2. Créez un projet (ou sélectionnez-en un existant).
3. Accédez à **APIs & Services > OAuth consent screen** et configurez-le.
4. Allez dans **APIs & Services > Credentials** et créez un **OAuth 2.0 Client ID** :
   - **Application type** : Web application
   - **Authorized redirect URIs** : Votre URL de rappel
5. Copiez le **Client ID** et le **Client secret**.
6. Définissez `OIDC_ISSUER_URL` sur `https://accounts.google.com`.
7. Définissez `OIDC_USERNAME_CLAIM` sur `email` (Google ne fournit pas `preferred_username`).

## Provisionnement des utilisateurs {#user-provisioning}

### Création automatique {#auto-create}

Lorsque `OIDC_AUTO_CREATE_USERS` vaut `true` (par défaut), un compte utilisateur local est créé la première fois qu'une personne se connecte via OIDC. Le nom d'utilisateur est repris de la revendication spécifiée par `OIDC_USERNAME_CLAIM`, et le rôle est défini sur `OIDC_DEFAULT_ROLE`.

En cas de collision de nom d'utilisateur, un suffixe numérique est ajouté (par ex. `jane` devient `jane_2`).

### Liaison automatique {#auto-link}

Lorsque `OIDC_AUTO_LINK_USERS` vaut `true`, SnapOtter lie une identité OIDC à un compte local existant si les adresses e-mail correspondent. C'est utile lorsque vous avez pré-créé des comptes utilisateurs et souhaitez qu'ils commencent à utiliser le SSO sans perdre leurs données.

::: warning 
N'activez la liaison automatique que si vous faites confiance à votre fournisseur OIDC pour vérifier les adresses e-mail. Un e-mail non vérifié pourrait permettre à quelqu'un de prendre le contrôle du compte d'un autre utilisateur.
:::

### Désactivation de la connexion locale {#disabling-local-login}

OIDC ne désactive pas la connexion locale par nom d'utilisateur/mot de passe. Les deux méthodes restent disponibles. Les administrateurs peuvent toujours se connecter avec des identifiants locaux si le fournisseur OIDC est injoignable.

## Certificats auto-signés {#self-signed-certificates}

Si votre fournisseur OIDC utilise un certificat auto-signé ou une autorité de certification privée, montez le bundle de CA dans le conteneur et pointez `NODE_EXTRA_CA_CERTS` vers lui :

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
Ne définissez pas `NODE_TLS_REJECT_UNAUTHORIZED=0`. Cela désactive toute vérification TLS et constitue un risque de sécurité.
:::

## Dépannage {#troubleshooting}

### Non-correspondance de l'URI de redirection {#redirect-uri-mismatch}

L'erreur la plus courante. Vérifiez ces différences entre ce que votre fournisseur attend et ce que SnapOtter envoie :

- `http` vs `https` - le schéma doit correspondre exactement
- Barre oblique finale - certains fournisseurs sont stricts à ce sujet
- Numéro de port - incluez le port s'il n'est pas standard
- Chemin - doit être `/api/auth/oidc/callback`

Vérifiez bien `EXTERNAL_URL`. Il doit correspondre à l'URL que les utilisateurs saisissent dans leur navigateur.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

Le fournisseur OIDC utilise un certificat auquel Node.js ne fait pas confiance. Voir [Certificats auto-signés](#self-signed-certificates) ci-dessus.

### Erreurs de décalage d'horloge {#clock-skew-errors}

Si l'horloge de votre serveur et celle du fournisseur OIDC sont désynchronisées, la validation des jetons peut échouer. Augmentez `OIDC_CLOCK_TOLERANCE` (la valeur par défaut est de 30 secondes). Une meilleure solution consiste à exécuter NTP sur les deux machines.

### « Fournisseur OIDC injoignable » {#oidc-provider-unreachable}

SnapOtter récupère le document de découverte du fournisseur au démarrage et pendant la connexion. Vérifiez :

- La résolution DNS depuis l'intérieur du conteneur Docker (`docker exec snapotter nslookup auth.example.com`)
- Les règles de pare-feu entre le conteneur et le fournisseur
- La valeur `OIDC_ISSUER_URL` - elle doit être accessible depuis le serveur, pas seulement depuis votre navigateur

### Revendications manquantes {#missing-claims}

Si les noms d'utilisateur ou les e-mails sont vides après la connexion, votre fournisseur ne renvoie peut-être pas les revendications attendues. Vérifiez :

- Les portées configurées dans `OIDC_SCOPES` incluent `profile` et `email`
- Le fournisseur est configuré pour inclure la revendication spécifiée dans `OIDC_USERNAME_CLAIM` dans le jeton d'ID
- Certains fournisseurs exigent une configuration explicite de mappeur/portée pour libérer les revendications
