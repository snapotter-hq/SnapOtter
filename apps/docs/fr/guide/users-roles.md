---
description: "Gérez les utilisateurs, les rôles intégrés et personnalisés, les permissions, les clés API, les équipes, les sessions et le journal d'audit dans SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 0ef660e3c9b1
---

# Utilisateurs, rôles et permissions {#users-roles-permissions}

SnapOtter est livré avec trois rôles intégrés, 17 permissions granulaires et la prise en charge de rôles personnalisés avec un contrôle d'accès facultatif par outil. Cette page couvre le modèle d'autorisation complet, le cadrage des clés API, la gestion des équipes et la journalisation d'audit.

::: tip Pages associées
[OIDC / SSO](/fr/guide/oidc) | [SAML SSO](/fr/guide/saml) | [Provisionnement SCIM](/fr/guide/scim) | [Sécurité et durcissement](/fr/guide/security)
:::

## Utilisateurs {#users}

### Créer des utilisateurs {#creating-users}

Les administrateurs peuvent créer des utilisateurs via le panneau d'administration ou le point de terminaison `POST /api/auth/register`. Chaque utilisateur possède un nom d'utilisateur, un rôle, une affectation d'équipe et une adresse e-mail facultative.

### Administrateur par défaut {#default-admin}

Au premier démarrage, SnapOtter crée un compte administrateur par défaut. Les identifiants proviennent de variables d'environnement :

| Variable | Valeur par défaut | Description |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Nom d'utilisateur du compte administrateur initial |
| `DEFAULT_PASSWORD` | `admin` | Mot de passe du compte administrateur initial |

L'administrateur par défaut doit obligatoirement changer son mot de passe à la première connexion.

### Fournisseurs d'authentification {#authentication-providers}

Les utilisateurs peuvent s'authentifier par plusieurs méthodes :

- **Local** - nom d'utilisateur et mot de passe stockés dans la base de données SnapOtter
- **OIDC** - tout fournisseur OpenID Connect (voir [OIDC / SSO](/fr/guide/oidc))
- **SAML** - fournisseurs d'identité SAML 2.0 (voir [SAML SSO](/fr/guide/saml))
- **SCIM** - provisionnement automatisé depuis un fournisseur d'identité (voir [Provisionnement SCIM](/fr/guide/scim))

### Désactiver l'authentification {#disabling-authentication}

Définissez `AUTH_ENABLED=false` pour désactiver entièrement l'authentification. Dans ce mode, un utilisateur anonyme synthétique doté du rôle `admin` est utilisé pour toutes les requêtes. Aucune connexion n'est requise.

::: warning 
Désactiver l'authentification accorde un accès administrateur complet à toute personne pouvant atteindre l'instance. À n'utiliser que dans des environnements de confiance.
:::

## Rôles intégrés {#built-in-roles}

SnapOtter comprend trois rôles intégrés. Ils ne peuvent être ni modifiés ni supprimés.

### Administrateur {#admin}

Les 17 permissions. Contrôle total sur l'instance.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Éditeur {#editor}

7 permissions. Peut utiliser tous les outils et gérer tous les fichiers et pipelines, mais ne peut pas accéder aux fonctions d'administration.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### Utilisateur {#user}

5 permissions. Peut utiliser les outils et gérer ses propres ressources.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Référence des permissions {#permissions-reference}

| Permission | Description |
|---|---|
| `tools:use` | Utiliser n'importe quel outil de traitement |
| `files:own` | Consulter et gérer ses propres fichiers |
| `files:all` | Consulter et gérer les fichiers de tous les utilisateurs |
| `apikeys:own` | Créer et gérer ses propres clés API |
| `apikeys:all` | Consulter les clés API de tous les utilisateurs |
| `pipelines:own` | Créer et gérer ses propres pipelines |
| `pipelines:all` | Consulter et gérer les pipelines de tous les utilisateurs |
| `settings:read` | Consulter les paramètres de l'instance |
| `settings:write` | Modifier les paramètres de l'instance |
| `users:manage` | Créer, mettre à jour et supprimer des comptes utilisateur |
| `teams:manage` | Créer, mettre à jour et supprimer des équipes |
| `features:manage` | Installer et gérer les bundles de fonctionnalités IA |
| `system:health` | Accéder aux points de terminaison de santé et de disponibilité |
| `audit:read` | Consulter le journal d'audit et lister les rôles |
| `compliance:manage` | Gérer le cycle de vie RGPD et les fonctionnalités de conformité |
| `webhooks:manage` | Configurer les webhooks sortants |
| `security:manage` | Gérer les paramètres de sécurité (liste d'autorisation d'IP, application du SSO) |

## Rôles personnalisés {#custom-roles}

Les administrateurs disposant de la permission `security:manage` peuvent créer des rôles personnalisés via le panneau d'administration ou l'API des rôles. Lister les rôles nécessite `audit:read`.

### Créer un rôle personnalisé {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Les noms de rôle doivent comporter de 2 à 30 caractères, en minuscules alphanumériques avec des tirets et des traits de soulignement.

### Permissions réservées aux administrateurs {#admin-reserved-permissions}

Trois permissions sont réservées aux rôles intégrés et ne peuvent pas être attribuées à des rôles personnalisés :

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

L'API des rôles rejette toute requête qui inclut ces permissions. Seul le rôle intégré `admin` y a accès.

### Permissions au niveau des outils {#tool-level-permissions}

Les rôles personnalisés peuvent éventuellement restreindre les outils auxquels les utilisateurs peuvent accéder. Deux modes sont disponibles :

| Mode | Comportement | Exigence de licence |
|---|---|---|
| `category` | Restreindre par modalité (image, vidéo, audio, document, fichier) | Aucune (gratuit) |
| `tool` | Restreindre par ID d'outil individuel | Nécessite la fonctionnalité entreprise `per_tool_permissions` |

Lorsque le mode `tool` est défini mais que la fonctionnalité entreprise n'est pas disponible, SnapOtter se dégrade en douceur et autorise l'accès à tous les outils.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### Supprimer un rôle personnalisé {#deleting-a-custom-role}

Lorsqu'un rôle personnalisé est supprimé, tous les utilisateurs qui y sont affectés sont automatiquement réaffectés au rôle `user`.

## Équipes {#teams}

Les équipes regroupent les utilisateurs pour la gestion du stockage et de la rétention. Une équipe `Default` est créée au premier démarrage.

| Champ | Type | Description |
|---|---|---|
| `name` | string | Nom d'équipe unique (1 à 50 caractères) |
| `storageQuota` | number | Limite de stockage par équipe en octets (fonctionne sans licence entreprise) |
| `retentionHours` | number | Suppression automatique des sorties après ce nombre d'heures (nécessite `team_retention_overrides`, entreprise) |
| `legalHold` | boolean | Empêcher la suppression automatique des fichiers des membres de l'équipe (nécessite `legal_hold`, entreprise) |

::: info 
L'équipe `Default` ne peut pas être supprimée. Les équipes qui ont encore des membres ne peuvent pas être supprimées. Réaffectez d'abord les membres.
:::

## Clés API {#api-keys}

Les utilisateurs peuvent générer des clés API pour un accès programmatique. Chaque clé utilise le préfixe `si_` et n'est affichée qu'une seule fois, au moment de la création.

### Permissions cadrées {#scoped-permissions}

Les clés API peuvent éventuellement porter un tableau `permissions`. Lorsqu'il est défini, les permissions effectives d'une requête correspondent à l'**intersection** des permissions du rôle de l'utilisateur et des permissions cadrées de la clé. Cela signifie qu'une clé API ne peut jamais dépasser les permissions propres de l'utilisateur.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### Expiration {#expiration}

Les clés acceptent un horodatage `expiresAt` facultatif. Les clés expirées sont rejetées au moment de l'authentification.

## Journal d'audit {#audit-log}

SnapOtter enregistre les événements pertinents pour la sécurité dans un journal d'audit structuré, stocké dans la table de base de données `audit_log`.

### Consulter le journal d'audit {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Nécessite la permission `audit:read`. Prend en charge la pagination (`page`, `limit`) et les filtres (`action`, `ip`, `from`, `to`).

### Audit des opérations sur les outils {#tool-operation-auditing}

::: warning 
Les événements `TOOL_EXECUTED` ne sont **pas** journalisés par défaut. Ils sont activés au choix par l'une des deux voies suivantes :

1. Définir le paramètre administrateur `auditToolOperations` sur `true`.
2. Détenir une licence active dotée de la fonctionnalité `audit_export` (disponible sur les plans team et entreprise).

Sans l'une de ces deux options, les exécutions d'outils individuelles ne sont pas enregistrées dans le journal d'audit.
:::

### Exporter {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Nécessite la permission `audit:read` et la fonctionnalité entreprise `audit_export` (disponible sur les plans team et entreprise). Prend en charge les formats CSV et JSON, filtrés par `action`, `actorId`, `targetType`, `targetId`, `from` et `to`.

### Signature inviolable {#tamper-resistant-signing}

Lorsqu'elle est activée, chaque entrée du journal d'audit est signée avec un HMAC dérivé de `DATA_ENCRYPTION_KEY`. Cela nécessite :

1. De définir `DATA_ENCRYPTION_KEY` dans votre environnement.
2. D'activer le paramètre administrateur `tamperResistantAudit`.
3. Une licence entreprise dotée de la fonctionnalité `tamper_resistant_audit`.

### Rétention {#retention}

Définissez `AUDIT_RETENTION_DAYS` pour purger automatiquement les anciennes entrées. La valeur par défaut est `0`, ce qui signifie que les entrées sont conservées indéfiniment.

### Référence des événements {#event-reference}

| Événement | Catégorie |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Authentification |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Authentification |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Authentification |
| `LOGOUT` | Authentification |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Gestion des utilisateurs |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Gestion des utilisateurs |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Rôles |
| `API_KEY_CREATED`, `API_KEY_DELETED` | Clés API |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Paramètres |
| `FILE_UPLOADED`, `FILE_DELETED` | Fichiers |
| `TOOL_EXECUTED` | Outils (activation au choix) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Conformité |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Conformité |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuration |

## Gestion des sessions {#session-management}

Les sessions sont basées sur des cookies, contrôlées par `SESSION_DURATION_HOURS` (par défaut : 168 heures / 7 jours).

### Les changements de rôle invalident les sessions {#role-changes-invalidate-sessions}

Lorsqu'un administrateur modifie le rôle d'un utilisateur, toutes les sessions actives de cet utilisateur sont supprimées. L'utilisateur doit se reconnecter pour prendre en compte ses nouvelles permissions.

### Garde-fous de sécurité {#safety-guards}

- **Protection du dernier administrateur** : le dernier administrateur restant ne peut pas être rétrogradé à un rôle inférieur. L'API renvoie une erreur si vous essayez.
- **Prévention de l'auto-suppression** : les administrateurs ne peuvent pas supprimer leur propre compte via l'API.
