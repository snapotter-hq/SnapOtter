---
description: "Schéma de base de données PostgreSQL, tables, migrations et procédures de sauvegarde pour SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 59270e5542d8
---

# Base de données {#database}

SnapOtter utilise PostgreSQL 17 avec [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) pour la persistance des données. Le schéma est défini dans `apps/api/src/db/schema.ts`.

La connexion est configurée via la variable d'environnement `DATABASE_URL` (par défaut `postgres://snapotter:snapotter@postgres:5432/snapotter`). Dans Docker Compose, le conteneur Postgres stocke ses données dans le volume nommé `SnapOtter-pgdata`.

## Tables {#tables}

### users {#users}

Stocke les comptes utilisateurs. Créé automatiquement au premier démarrage à partir de `DEFAULT_USERNAME` et `DEFAULT_PASSWORD`.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `username` | varchar | Unique, requis |
| `passwordHash` | varchar | Hachage scrypt |
| `role` | varchar | `admin`, `editor` ou `user` |
| `mustChangePassword` | boolean | Indicateur de réinitialisation forcée du mot de passe |
| `createdAt` | timestamp | Date de création |
| `updatedAt` | timestamp | Date de dernière mise à jour |

### sessions {#sessions}

Sessions de connexion actives. Chaque ligne associe un jeton de session à un utilisateur.

| Colonne | Type | Notes |
|---|---|---|
| `id` | varchar | Clé primaire (jeton de session) |
| `userId` | uuid | Clé étrangère vers `users.id` |
| `expiresAt` | timestamp | Date d'expiration |
| `createdAt` | timestamp | Date de création |

### teams {#teams}

Groupes pour organiser les utilisateurs. Les administrateurs peuvent affecter des utilisateurs à des équipes.

| Colonne | Type | Description |
|--------|------|-------------|
| `id` | uuid | Clé primaire |
| `name` | varchar (unique, 50 caractères max) | Nom de l'équipe |
| `createdAt` | timestamp | Date de création |

### api_keys {#api-keys}

Clés API pour l'accès programmatique. La clé brute n'est affichée qu'une seule fois lors de la création ; seul le hachage est stocké.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `userId` | uuid | Clé étrangère vers `users.id` |
| `keyHash` | varchar | Hachage scrypt de la clé |
| `name` | varchar | Libellé fourni par l'utilisateur |
| `createdAt` | timestamp | Date de création |
| `lastUsedAt` | timestamp | Mise à jour à chaque requête authentifiée |

Les clés sont préfixées par `si_` suivi de 96 caractères hexadécimaux (48 octets aléatoires).

### pipelines {#pipelines}

Chaînes d'outils enregistrées que les utilisateurs créent dans l'interface.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `name` | varchar | Nom du pipeline |
| `description` | varchar | Description facultative |
| `steps` | jsonb | Tableau d'objets `{ toolId, settings }` |
| `createdAt` | timestamp | Date de création |

### user_files {#user-files}

Bibliothèque de fichiers persistante avec suivi de la chaîne de versions. Chaque étape de traitement qui enregistre un résultat crée une nouvelle ligne liée à son parent via `parentId`, formant un arbre de versions.

| Colonne | Type | Description |
|--------|------|-------------|
| `id` | uuid | Clé primaire |
| `userId` | uuid | FK vers users (CASCADE DELETE) |
| `originalName` | varchar | Nom de fichier d'envoi d'origine |
| `storedName` | varchar | Nom de fichier sur le disque |
| `mimeType` | varchar | Type MIME |
| `size` | integer | Taille du fichier en octets |
| `width` | integer | Largeur de l'image en px |
| `height` | integer | Hauteur de l'image en px |
| `version` | integer | Numéro de version (1 = original) |
| `parentId` | uuid ou null | FK vers user_files (version parente) |
| `toolChain` | jsonb | ID d'outils appliqués dans l'ordre pour produire cette version |
| `createdAt` | timestamp | Date de création |

### jobs {#jobs}

Suit les tâches de traitement pour le rapport de progression et le nettoyage.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `type` | varchar | Identifiant d'outil ou de pipeline |
| `status` | varchar | `queued`, `processing`, `completed` ou `failed` |
| `progress` | real | Fraction 0.0-1.0 |
| `inputFiles` | jsonb | Tableau de chemins de fichiers d'entrée |
| `outputPath` | varchar | Chemin vers le fichier de résultat |
| `settings` | jsonb | Paramètres d'outil utilisés |
| `error` | varchar | Message d'erreur en cas d'échec |
| `createdAt` | timestamp | Date de création |
| `completedAt` | timestamp | Date d'achèvement |

### settings {#settings}

Magasin clé-valeur pour les paramètres à l'échelle du serveur que les administrateurs peuvent modifier depuis l'interface.

| Colonne | Type | Notes |
|---|---|---|
| `key` | varchar | Clé primaire |
| `value` | varchar | Valeur du paramètre |
| `updatedAt` | timestamp | Date de dernière mise à jour |

### roles {#roles}

Rôles personnalisés avec des permissions granulaires.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `name` | varchar | Nom de rôle unique |
| `description` | varchar | Description facultative |
| `permissions` | jsonb | Tableau de chaînes de permission |
| `createdAt` | timestamp | Date de création |

### audit_log {#audit-log}

Journal des actions pertinentes pour la sécurité.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `userId` | uuid | FK vers users |
| `action` | varchar | Type d'action |
| `details` | jsonb | Données spécifiques à l'action |
| `createdAt` | timestamp | Date de l'action |

## Migrations {#migrations}

Drizzle gère les migrations de schéma. Les fichiers de migration se trouvent dans `apps/api/drizzle/`. Pendant le développement :

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

En production, les migrations en attente sont appliquées automatiquement au démarrage.

## Sauvegarde et restauration {#backup-and-restore}

La base de données relationnelle se trouve dans le volume `SnapOtter-pgdata` du conteneur Postgres, et non dans le volume `/data` de l'application.

**Option 1 : pg_dump (recommandé)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Option 2 : Instantané de volume**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migration depuis la 1.x (SQLite) {#migrating-from-1-x-sqlite}

La mise à niveau depuis SnapOtter 1.x a son propre guide : voir [Mise à niveau de la 1.x vers la 2.0](./upgrading). En bref, réutilisez votre volume `/data` existant et la 2.0 détecte automatiquement et importe `/data/snapotter.db` au premier démarrage (ou définissez `SQLITE_MIGRATE_PATH` pour le pointer explicitement). Sauvegardez d'abord l'intégralité du volume `/data`, pas seulement `snapotter.db` : la 1.x utilise le mode WAL de SQLite, donc un conteneur arrêté laisse souvent la plupart de ses données dans `snapotter.db-wal` à côté d'un `snapotter.db` presque vide.
