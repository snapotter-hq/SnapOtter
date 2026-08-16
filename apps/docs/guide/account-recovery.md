# Account Recovery

If you get locked out of SnapOtter (most often by an MFA policy you can no
longer satisfy), you can recover from inside the container without a database
client. Recovery commands are offline and require shell access to the container,
which already means full control of the instance.

## Which wall am I hitting?

SnapOtter's login applies two independent MFA gates. Diagnose first:

```bash
docker exec -it snapotter snapotter-admin status
```

This prints the current MFA policy and which users have TOTP enrolled.

- **"MFA enrollment is required before login" (and you never set up an app):**
  the policy requires MFA but you have no enrollment. Relax the policy.
- **You are prompted for a code you cannot produce** (lost your phone and your
  recovery codes): your account is enrolled. Clear that enrollment.

## Relax the MFA policy

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

This sets the policy back to `optional`. It applies on your next login with no
restart. It only ever sets `optional`, so it cannot turn enforcement back on.

## Clear one user's TOTP enrollment

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

If the policy still requires MFA for that user, they will hit the enrollment
wall next, so also run `reset-mfa-policy`, log in, and re-enroll from Settings.

## Older images and fallbacks

On an image built before the `snapotter-admin` wrapper existed, call the script
directly:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

As a last resort on any version, set the policy in the database. On the
all-in-one image Postgres runs inside the container:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

On the multi-container setup, point `psql` at your own `DATABASE_URL` instead.

## Locked out of SSO, not MFA?

If an enforced SSO login is failing, use the break-glass local account instead:
set `ssoBreakGlassUsername` to a local admin under Settings > Security before you
enforce SSO, and log in with that account's password.
