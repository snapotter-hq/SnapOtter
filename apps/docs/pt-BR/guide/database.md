---
description: "Esquema do banco de dados PostgreSQL, tabelas, migrações e procedimentos de backup do SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: bd8d8459b7e0
i18n_hash_version: 2
---

# Banco de dados {#database}

O SnapOtter usa PostgreSQL 17 com [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) para persistência de dados. O esquema é definido em `apps/api/src/db/schema.ts`.

A conexão é configurada através da variável de ambiente `DATABASE_URL` (padrão `postgres://snapotter:snapotter@postgres:5432/snapotter`). No Docker Compose, o contêiner do Postgres armazena seus dados no volume nomeado `SnapOtter-pgdata`. As requisições são atendidas por um papel que só consegue ler e gravar linhas, o que é detalhado em [Papéis de privilégio mínimo](#least-privilege-roles) mais abaixo.

## Tabelas {#tables}

### users {#users}

Armazena contas de usuário. Criada automaticamente na primeira execução a partir de `DEFAULT_USERNAME` e `DEFAULT_PASSWORD`.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `username` | varchar | Único, obrigatório |
| `passwordHash` | varchar | hash scrypt |
| `role` | varchar | `admin`, `editor` ou `user` |
| `mustChangePassword` | boolean | Flag de redefinição de senha forçada |
| `createdAt` | timestamp | Horário de criação |
| `updatedAt` | timestamp | Horário da última atualização |

### sessions {#sessions}

Sessões de login ativas. Cada linha vincula um token de sessão a um usuário.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | varchar | Chave primária (token de sessão) |
| `userId` | uuid | Chave estrangeira para `users.id` |
| `expiresAt` | timestamp | Horário de expiração |
| `createdAt` | timestamp | Horário de criação |

### teams {#teams}

Grupos para organizar usuários. Administradores podem atribuir usuários a equipes.

| Coluna | Tipo | Descrição |
|--------|------|-------------|
| `id` | uuid | Chave primária |
| `name` | varchar (único, máx. 50 caracteres) | Nome da equipe |
| `createdAt` | timestamp | Horário de criação |

### api_keys {#api-keys}

Chaves de API para acesso programático. A chave bruta é exibida uma única vez na criação; apenas o hash é armazenado.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `userId` | uuid | Chave estrangeira para `users.id` |
| `keyHash` | varchar | hash scrypt da chave |
| `name` | varchar | Rótulo fornecido pelo usuário |
| `createdAt` | timestamp | Horário de criação |
| `lastUsedAt` | timestamp | Atualizado a cada requisição autenticada |

As chaves têm o prefixo `si_` seguido de 96 caracteres hexadecimais (48 bytes aleatórios).

### pipelines {#pipelines}

Cadeias de ferramentas salvas que os usuários criam na interface.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `name` | varchar | Nome do pipeline |
| `description` | varchar | Descrição opcional |
| `steps` | jsonb | Array de objetos `{ toolId, settings }` |
| `createdAt` | timestamp | Horário de criação |

### user_files {#user-files}

Biblioteca de arquivos persistente. Uma edição salva é inserida por padrão como uma linha raiz independente ("salvar como novo": `version` 1, `parentId` null, então o original permanece listado), ou como uma versão vinculada ao pai quando você sobrescreve o original (`parentId` definido, `version` incrementado, substituindo-o). A coluna `toolChain` registra as ferramentas aplicadas.

| Coluna | Tipo | Descrição |
|--------|------|-------------|
| `id` | uuid | Chave primária |
| `userId` | uuid | FK para users (CASCADE DELETE) |
| `originalName` | varchar | Nome do arquivo enviado original |
| `storedName` | varchar | Nome do arquivo em disco |
| `mimeType` | varchar | Tipo MIME |
| `size` | integer | Tamanho do arquivo em bytes |
| `width` | integer | Largura da imagem em px |
| `height` | integer | Altura da imagem em px |
| `version` | integer | Número da versão (1 = original) |
| `parentId` | uuid ou null | FK para user_files (versão pai) |
| `toolChain` | jsonb | IDs de ferramentas aplicados em ordem para produzir esta versão |
| `createdAt` | timestamp | Horário de criação |

### jobs {#jobs}

Rastreia jobs de processamento para relatório de progresso e limpeza.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `type` | varchar | Identificador da ferramenta ou do pipeline |
| `status` | varchar | `queued`, `processing`, `completed` ou `failed` |
| `progress` | real | Fração de 0.0 a 1.0 |
| `inputFiles` | jsonb | Array de caminhos de arquivos de entrada |
| `outputPath` | varchar | Caminho para o arquivo de resultado |
| `settings` | jsonb | Configurações da ferramenta utilizadas |
| `error` | varchar | Mensagem de erro se falhou |
| `createdAt` | timestamp | Horário de criação |
| `completedAt` | timestamp | Horário de conclusão |

### settings {#settings}

Armazenamento de chave-valor para configurações de todo o servidor que os administradores podem alterar pela interface.

| Coluna | Tipo | Observações |
|---|---|---|
| `key` | varchar | Chave primária |
| `value` | varchar | Valor da configuração |
| `updatedAt` | timestamp | Horário da última atualização |

### roles {#roles}

Papéis personalizados com permissões granulares.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `name` | varchar | Nome único do papel |
| `description` | varchar | Descrição opcional |
| `permissions` | jsonb | Array de strings de permissão |
| `createdAt` | timestamp | Horário de criação |

### audit_log {#audit-log}

Registro de ações relevantes para segurança.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `userId` | uuid | FK para users |
| `action` | varchar | Tipo de ação |
| `details` | jsonb | Dados específicos da ação |
| `createdAt` | timestamp | Horário da ação |

### user_preferences {#user-preferences}

Estado da interface por usuário, indexado pelo nome da preferência. Guarda as ferramentas fixadas da página inicial, gravadas por meio de `PUT /api/v1/preferences`.

| Coluna | Tipo | Observações |
|---|---|---|
| `userId` | text | FK para users, com exclusão em cascata. Chave primária junto com `key` |
| `key` | text | Nome da preferência. Chave primária junto com `userId` |
| `value` | jsonb | Conteúdo da preferência |
| `updatedAt` | timestamp | Última gravação |

## Migrações {#migrations}

O Drizzle cuida das migrações de esquema. Os arquivos de migração ficam em `apps/api/drizzle/`. Durante o desenvolvimento:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Em produção, as migrações pendentes são aplicadas automaticamente na inicialização.

## Papéis de privilégio mínimo {#least-privilege-roles}

Dois papéis, duas tarefas. O `DATABASE_URL` atende às requisições e detém `SELECT`, `INSERT`, `UPDATE`, `DELETE` nas tabelas do aplicativo, além de `USAGE` e `SELECT` nas sequências delas. Essa é a lista inteira. Ele não pode criar nem remover uma tabela, instalar uma extensão, executar `TRUNCATE`, ler `pg_authid`, criar um banco de dados, alterar um papel ou tocar no esquema `drizzle`, onde fica o histórico de migrações.

O `DATABASE_MIGRATION_URL` é o privilegiado. Ele executa as migrações e concede as permissões ao papel de execução durante a inicialização, e então se encerra antes de qualquer requisição ser atendida.

O Compose e a imagem tudo-em-um já vêm configurados assim, inclusive as instalações existentes. Na inicialização, o SnapOtter cria o papel de execução caso ele não exista, concede as permissões, aplica as migrações e depois estende essas permissões às tabelas que já estavam lá. Atualizar não exige nenhum SQL manual.

Deixar o `DATABASE_MIGRATION_URL` vazio faz tudo rodar com um papel único, com o `DATABASE_URL` cumprindo as duas tarefas exatamente como fazia antes da separação. Essa é uma configuração suportada, e não uma configuração obsoleta. É a resposta certa no Postgres gerenciado, onde criar papéis muitas vezes não está nas suas mãos.

### Postgres externo e gerenciado {#external-and-managed-postgres}

No RDS, no Supabase, no Cloud SQL ou em qualquer cluster que você mesmo administre, a separação é opcional. Crie o papel de execução uma única vez:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Depois entregue ao SnapOtter as duas strings de conexão, apontando para o mesmo host, a mesma porta e o mesmo banco de dados:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Pare por aí. O próprio SnapOtter aplica as permissões e as reaplica depois de cada migração, então uma tabela adicionada por uma versão futura já fica coberta sem que ninguém precise rodar SQL para isso.

O papel indicado em `DATABASE_MIGRATION_URL` precisa ser dono das tabelas do SnapOtter, porque só o dono de uma tabela pode conceder permissões sobre ela. Em uma instalação existente, isso significa o papel com o qual você vem executando o SnapOtter, e não um papel novo criado para esse fim. Aponte para um papel novo que não seja dono de nada e a inicialização falha com um erro dizendo exatamente isso. Ele também precisa de `CREATEROLE` para criar e manter o papel de execução, e do direito de criar o esquema `drizzle`.

Informe o mesmo papel nas duas URLs e a separação fica desligada, e o SnapOtter avisa isso no log em vez de fingir o contrário. Se o seu provedor não oferece nenhum papel capaz de ser dono das tabelas e ao mesmo tempo ter `CREATEROLE`, fique com o papel único.

### Por que o bit de superusuário fica intocado {#why-the-superuser-bit-is-left-alone}

O SnapOtter nunca remove `SUPERUSER` de um papel por conta própria. Em uma instalação criada antes da separação, `snapotter` é o único superusuário do cluster, e rebaixá-lo deixaria o cluster sem nenhum, algo recuperável apenas pelo modo monousuário com o servidor parado. Quem garante a proteção, em vez disso, é mover a conexão de longa duração para o papel restrito. O superusuário fica na rede pelos poucos segundos da inicialização e depois some.

Instalações tudo-em-um novas nunca têm esse problema. Elas ganham três papéis: `postgres` (superusuário de bootstrap, ausente de toda string de conexão que o SnapOtter usa), `snapotter` (`NOSUPERUSER`, dono dos dados, conecta apenas na inicialização) e `snapotter_app` (só linhas, atende às requisições).

Para rebaixar um `snapotter` antigo mesmo assim, crie primeiro um segundo superusuário e faça login com ele para confirmar que funciona. Depois, `ALTER ROLE snapotter NOSUPERUSER`.

## Backup e restauração {#backup-and-restore}

O banco de dados relacional reside no volume `SnapOtter-pgdata` do contêiner Postgres, não no volume `/data` do aplicativo.

**Backup lógico com validação (recomendado)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Os dois comandos se conectam como `snapotter`, o dono, e devem continuar assim. O papel de execução não enxerga o esquema `drizzle`, então um dump feito com esse papel sairia incompleto. `--no-owner` deixa os objetos restaurados sob a posse de quem executa a restauração, então rodar isso como o dono coloca a posse onde as permissões esperam encontrá-la. Uma pegadinha em um cluster novo: o `pg_dump` leva as permissões, mas não os papéis que elas citam, então crie `snapotter_app` antes de restaurar ou `--exit-on-error` para no primeiro `GRANT`. De qualquer forma, o SnapOtter reaplica as permissões na próxima inicialização.

Este dump do banco de dados não contém objetos de biblioteca salvos em `/data/files` ou estado BullMQ durável no Redis. Faça backup e restaure-os com o procedimento coordenado em [Segurança e Proteção](/pt-BR/guide/security#backup-and-recovery).

**Instantâneo de volume frio**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Não copie um diretório de dados PostgreSQL ativo com `tar`. Componha nomes de volume de prefixos por projeto, portanto resolva os IDs de volume montados de `docker inspect` ou de sua plataforma de armazenamento em vez de assumir o rótulo literal `SnapOtter-pgdata`.

### Migrando da versão 1.x (SQLite) {#migrating-from-1-x-sqlite}

Atualizar do SnapOtter 1.x tem seu próprio guia: veja [Atualizando da 1.x para a 2.0](./upgrading). Em resumo, reutilize seu volume `/data` existente e a 2.0 detecta e importa automaticamente o `/data/snapotter.db` na primeira inicialização (ou defina `SQLITE_MIGRATE_PATH` para apontar para ele explicitamente). Faça backup de todo o volume `/data` primeiro, não apenas de `snapotter.db`: a 1.x usa o modo WAL do SQLite, então um contêiner parado frequentemente deixa a maior parte de seus dados em `snapotter.db-wal` ao lado de um `snapotter.db` quase vazio.
