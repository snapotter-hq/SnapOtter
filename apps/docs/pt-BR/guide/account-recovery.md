---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: a69b406a38fb
i18n_hash_version: 2
---
# Recuperação de conta {#account-recovery}

Se você ficar bloqueado fora do SnapOtter (na maioria das vezes por uma política
de MFA que você não consegue mais atender), dá para recuperar o acesso de dentro
do contêiner sem um cliente de banco de dados. Os comandos de recuperação são
offline e exigem acesso ao shell do contêiner, o que já significa controle total.

## Em qual barreira estou esbarrando? {#which-wall-am-i-hitting}

O login do SnapOtter aplica dois portões de MFA independentes. Diagnostique antes:

```bash
docker exec -it snapotter snapotter-admin status
```

Isso imprime a política de MFA atual e quais usuários têm o TOTP habilitado.

- **"É obrigatório inscrever-se no MFA antes do login" (e você nunca configurou um app):**
  a política exige MFA, mas você não tem inscrição. Relaxe a política.
- **É pedido um código que você não consegue gerar** (perdeu o celular e os
  códigos de recuperação): sua conta está inscrita. Remova essa inscrição.

## Relaxe a política de MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Isso volta a política para `optional`. Ela vale no próximo login, sem
reinício. Ela só define `optional`, então não consegue reativar a imposição.

## Remova a inscrição no TOTP de um usuário {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Se a política ainda exigir MFA para esse usuário, ele vai esbarrar na barreira de
inscrição a seguir, então rode também `reset-mfa-policy`, faça login e reinscreva-se nas Configurações.

## Imagens mais antigas e alternativas {#older-images-and-fallbacks}

Numa imagem criada antes de o wrapper `snapotter-admin` existir, chame o script
diretamente:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

Como último recurso em qualquer versão, defina a política no banco de dados. Na
imagem all-in-one, o Postgres roda dentro do contêiner:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

Na configuração multi-contêiner, aponte `psql` para o seu próprio `DATABASE_URL`.

## Bloqueado do SSO, e não do MFA? {#locked-out-of-sso-not-mfa}

Se um login SSO obrigatório estiver falhando, use a conta local de emergência:
defina `ssoBreakGlassUsername` como administrador local em Configurações > Segurança antes de
impor o SSO, e faça login com a senha dessa conta.
