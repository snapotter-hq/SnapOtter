---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: 425756d5eabf
i18n_hash_version: 2
---
# Récupération de compte {#account-recovery}

Si vous êtes bloqué hors de SnapOtter (le plus souvent à cause d'une politique MFA
que vous ne pouvez plus satisfaire), vous pouvez effectuer une récupération depuis l'intérieur
du conteneur sans client de base de données. Les commandes de récupération sont hors ligne et nécessitent un accès shell au conteneur,
ce qui suppose déjà un contrôle total de l'instance.

## À quel mur suis-je confronté ? {#which-wall-am-i-hitting}

La connexion de SnapOtter applique deux barrières MFA indépendantes. Diagnostiquez d'abord :

```bash
docker exec -it snapotter snapotter-admin status
```

Cela affiche la politique MFA actuelle et quels utilisateurs ont activé TOTP.

- **« MFA enrollment is required before login » (et vous n'avez jamais configuré d'application) :**
  la politique exige la MFA mais vous n'avez aucune inscription. Assouplissez la politique.
- **On vous demande un code que vous ne pouvez pas produire** (téléphone perdu ainsi que vos
  codes de récupération) : votre compte est inscrit. Effacez cette inscription.

## Assouplir la politique MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Cela remet la politique sur `optional`. Elle s'applique à votre prochaine connexion sans
redémarrage. Elle ne définit jamais que `optional`, elle ne peut donc pas réactiver l'application forcée.

## Effacer l'inscription TOTP d'un utilisateur {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Si la politique exige toujours la MFA pour cet utilisateur, il se heurtera ensuite au mur
d'inscription ; exécutez donc aussi `reset-mfa-policy`, connectez-vous, puis réinscrivez-le depuis les Paramètres.

## Réinitialiser un mot de passe oublié {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

Omettez `[password]` pour que le CLI affiche un mot de passe temporaire généré. Dans les deux cas, les sessions actives, les clés API et la fenêtre de limitation des échecs de connexion de l'utilisateur sont effacées, et SnapOtter exige un changement de mot de passe à la connexion suivante.

## Amorcer un compte administrateur {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

Utilisez cette commande lorsqu'aucun compte administrateur existant ne peut se connecter. `[username]` prend par défaut la valeur `DEFAULT_USERNAME` (`admin`), et omettre `[password]` affiche un mot de passe temporaire qui doit être modifié dès la première connexion.

## Débloquer un utilisateur limité ou désactivé {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

Cela efface la fenêtre `LOGIN_THROTTLED` dans Redis et restaure le rôle du compte si l'utilisateur était désactivé.

## Images plus anciennes et solutions de repli {#older-images-and-fallbacks}

Sur une image construite avant l'existence du wrapper `snapotter-admin`, appelez le script
directement :

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

En dernier recours sur n'importe quelle version, définissez la politique dans la base de données. Sur
l'image tout-en-un, Postgres tourne à l'intérieur du conteneur :

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

Sur une configuration multi-conteneurs, faites plutôt pointer `psql` vers votre propre `DATABASE_URL`.

## Bloqué par le SSO, pas la MFA ? {#locked-out-of-sso-not-mfa}

Si une connexion SSO forcée échoue, utilisez plutôt le compte local de secours :
définissez `ssoBreakGlassUsername` sur un administrateur local dans Paramètres > Sécurité avant d'imposer
le SSO, et connectez-vous avec le mot de passe de ce compte.
