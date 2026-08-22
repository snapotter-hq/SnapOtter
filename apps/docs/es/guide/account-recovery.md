---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: a325dc9c708c
i18n_hash_version: 2
---
# Recuperación de la cuenta {#account-recovery}

Si te quedas fuera de SnapOtter (lo más habitual, por una política de MFA que ya
no puedes cumplir), puedes recuperar el acceso desde dentro del contenedor sin un
cliente de base de datos. Los comandos de recuperación son sin conexión y requieren
acceso al shell del contenedor, lo que ya implica control total de la instancia.

## ¿Con qué muro me estoy topando? {#which-wall-am-i-hitting}

El inicio de sesión de SnapOtter aplica dos controles de MFA independientes. Diagnostica primero:

```bash
docker exec -it snapotter snapotter-admin status
```

Esto imprime la política de MFA actual y qué usuarios tienen TOTP registrado.

- **"Es obligatorio registrar la MFA antes de iniciar sesión" (y nunca configuraste una app):**
  la política exige MFA pero no tienes ningún registro. Relaja la política.
- **Se te pide un código que no puedes generar** (perdiste el teléfono y tus
  códigos de recuperación): tu cuenta está registrada. Elimina ese registro.

## Relaja la política de MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Esto restablece la política a `optional`. Se aplica en tu siguiente inicio de sesión sin
reiniciar. Solo llega a establecer `optional`, así que no puede reactivar la obligatoriedad.

## Elimina el registro de TOTP de un usuario {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Si la política sigue exigiendo MFA a ese usuario, se topará con el muro del registro
a continuación, así que ejecuta también `reset-mfa-policy`, inicia sesión y vuelve a registrarte desde Configuración.

## Imágenes antiguas y alternativas {#older-images-and-fallbacks}

En una imagen creada antes de que existiera el envoltorio `snapotter-admin`, llama al script
directamente:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

Como último recurso en cualquier versión, establece la política en la base de datos.
En la imagen todo en uno, Postgres se ejecuta dentro del contenedor:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

En la configuración multicontenedor, apunta `psql` a tu propio `DATABASE_URL` en su lugar.

## ¿Sin acceso a SSO, no a MFA? {#locked-out-of-sso-not-mfa}

Si un inicio de sesión SSO obligatorio está fallando, usa la cuenta local de emergencia:
establece `ssoBreakGlassUsername` como administrador local en Configuración > Seguridad antes de
imponer SSO, e inicia sesión con la contraseña de esa cuenta.
