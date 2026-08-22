---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: 83d524f46fc3
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

## Images plus anciennes et solutions de repli {#older-images-and-fallbacks}

Sur une image construite avant l'existence du wrapper `snapotter-admin`, appelez le script
directement :

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
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
