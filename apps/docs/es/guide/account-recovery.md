---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: cfd2a8436281
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

## Restablece una contraseña olvidada {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

Si omites `[password]`, la CLI imprime una contraseña temporal generada. En ambos casos, se borran las sesiones activas, las claves de API y la ventana de bloqueo por intentos fallidos del usuario, y SnapOtter exige cambiar la contraseña en el siguiente inicio de sesión.

## Crea una cuenta de administrador inicial {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

Úsalo cuando ninguna cuenta de administrador existente pueda iniciar sesión. `[username]` toma por defecto `DEFAULT_USERNAME` (`admin`), y omitir `[password]` imprime una contraseña temporal que debe cambiarse en el primer inicio de sesión.

## Desbloquea un usuario limitado o deshabilitado {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

Esto borra la ventana `LOGIN_THROTTLED` en Redis y restaura el rol de la cuenta si el usuario estaba deshabilitado.

## Imágenes antiguas y alternativas {#older-images-and-fallbacks}

En una imagen creada antes de que existiera el envoltorio `snapotter-admin`, llama al script
directamente:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
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
