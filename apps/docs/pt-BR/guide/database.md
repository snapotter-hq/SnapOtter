---
description: "Esquema do banco de dados PostgreSQL, tabelas, migrações e procedimentos de backup do SnapOtter."
i18n_source_hash: 50d5d4f220cf
i18n_provenance: human
i18n_output_hash: dd1ed517c252
---

# Banco de dados {#database}

O SnapOtter usa PostgreSQL 17 com [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) para persistência de dados. O esquema é definido em `apps/api/src/db/schema.ts`.

A conexão é configurada através da variável de ambiente `DATABASE_URL` (padrão `postgres://snapotter:snapotter@postgres:5432/snapotter`). No Docker Compose, o contêiner do Postgres armazena seus dados no volume nomeado `SnapOtter-pgdata`.

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

## Migrações {#migrations}

O Drizzle cuida das migrações de esquema. Os arquivos de migração ficam em `apps/api/drizzle/`. Durante o desenvolvimento:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Em produção, as migrações pendentes são aplicadas automaticamente na inicialização.

## Backup e restauração {#backup-and-restore}

O banco de dados relacional fica no volume `SnapOtter-pgdata` do contêiner do Postgres, não no volume `/data` do aplicativo.

**Opção 1: pg_dump (recomendada)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Opção 2: Snapshot de volume**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migrando da versão 1.x (SQLite) {#migrating-from-1-x-sqlite}

Atualizar do SnapOtter 1.x tem seu próprio guia: veja [Atualizando da 1.x para a 2.0](./upgrading). Em resumo, reutilize seu volume `/data` existente e a 2.0 detecta e importa automaticamente o `/data/snapotter.db` na primeira inicialização (ou defina `SQLITE_MIGRATE_PATH` para apontar para ele explicitamente). Faça backup de todo o volume `/data` primeiro, não apenas de `snapotter.db`: a 1.x usa o modo WAL do SQLite, então um contêiner parado frequentemente deixa a maior parte de seus dados em `snapotter.db-wal` ao lado de um `snapotter.db` quase vazio.
