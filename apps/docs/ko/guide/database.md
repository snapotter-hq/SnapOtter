---
description: "SnapOtter의 PostgreSQL 데이터베이스 스키마, 테이블, 마이그레이션, 백업 절차."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 4616baed29d0
---

# 데이터베이스 {#database}

SnapOtter는 데이터 영속성을 위해 PostgreSQL 17과 [Drizzle ORM](https://orm.drizzle.team/)(pg-core / node-postgres)을 사용합니다. 스키마는 `apps/api/src/db/schema.ts`에 정의되어 있습니다.

연결은 `DATABASE_URL` 환경 변수로 구성됩니다(기본값 `postgres://snapotter:snapotter@postgres:5432/snapotter`). Docker Compose에서는 Postgres 컨테이너가 데이터를 `SnapOtter-pgdata` 명명된 볼륨에 저장합니다.

## 테이블 {#tables}

### users {#users}

사용자 계정을 저장합니다. 첫 실행 시 `DEFAULT_USERNAME`과 `DEFAULT_PASSWORD`에서 자동으로 생성됩니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `username` | varchar | 고유, 필수 |
| `passwordHash` | varchar | scrypt 해시 |
| `role` | varchar | `admin`, `editor`, 또는 `user` |
| `mustChangePassword` | boolean | 비밀번호 강제 재설정 플래그 |
| `createdAt` | timestamp | 생성 시각 |
| `updatedAt` | timestamp | 마지막 업데이트 시각 |

### sessions {#sessions}

활성 로그인 세션. 각 행은 세션 토큰을 사용자와 연결합니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | varchar | 기본 키 (세션 토큰) |
| `userId` | uuid | `users.id`에 대한 외래 키 |
| `expiresAt` | timestamp | 만료 시각 |
| `createdAt` | timestamp | 생성 시각 |

### teams {#teams}

사용자를 조직화하기 위한 그룹. 관리자는 사용자를 팀에 할당할 수 있습니다.

| 컬럼 | 타입 | 설명 |
|--------|------|-------------|
| `id` | uuid | 기본 키 |
| `name` | varchar (고유, 최대 50자) | 팀 이름 |
| `createdAt` | timestamp | 생성 시각 |

### api_keys {#api-keys}

프로그래밍 방식 접근을 위한 API 키. 원본 키는 생성 시 한 번만 표시되며, 해시만 저장됩니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `userId` | uuid | `users.id`에 대한 외래 키 |
| `keyHash` | varchar | 키의 scrypt 해시 |
| `name` | varchar | 사용자가 지정한 레이블 |
| `createdAt` | timestamp | 생성 시각 |
| `lastUsedAt` | timestamp | 인증된 요청마다 업데이트됨 |

키는 `si_` 접두어 뒤에 96개의 16진수 문자(48개의 임의 바이트)가 붙습니다.

### pipelines {#pipelines}

사용자가 UI에서 만드는 저장된 도구 체인.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `name` | varchar | 파이프라인 이름 |
| `description` | varchar | 선택적 설명 |
| `steps` | jsonb | `{ toolId, settings }` 객체의 배열 |
| `createdAt` | timestamp | 생성 시각 |

### user_files {#user-files}

버전 체인 추적 기능이 있는 영속 파일 라이브러리. 결과를 저장하는 각 처리 단계는 `parentId`를 통해 부모와 연결된 새 행을 생성하여 버전 트리를 형성합니다.

| 컬럼 | 타입 | 설명 |
|--------|------|-------------|
| `id` | uuid | 기본 키 |
| `userId` | uuid | users에 대한 FK (CASCADE DELETE) |
| `originalName` | varchar | 원본 업로드 파일명 |
| `storedName` | varchar | 디스크상의 파일명 |
| `mimeType` | varchar | MIME 타입 |
| `size` | integer | 바이트 단위 파일 크기 |
| `width` | integer | 이미지 너비(px) |
| `height` | integer | 이미지 높이(px) |
| `version` | integer | 버전 번호 (1 = 원본) |
| `parentId` | uuid 또는 null | user_files에 대한 FK (부모 버전) |
| `toolChain` | jsonb | 이 버전을 생성하기 위해 순서대로 적용된 도구 ID |
| `createdAt` | timestamp | 생성 시각 |

### jobs {#jobs}

진행 상황 보고와 정리를 위해 처리 작업을 추적합니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `type` | varchar | 도구 또는 파이프라인 식별자 |
| `status` | varchar | `queued`, `processing`, `completed`, 또는 `failed` |
| `progress` | real | 0.0-1.0 비율 |
| `inputFiles` | jsonb | 입력 파일 경로의 배열 |
| `outputPath` | varchar | 결과 파일 경로 |
| `settings` | jsonb | 사용된 도구 설정 |
| `error` | varchar | 실패 시 오류 메시지 |
| `createdAt` | timestamp | 생성 시각 |
| `completedAt` | timestamp | 완료 시각 |

### settings {#settings}

관리자가 UI에서 변경할 수 있는 서버 전역 설정을 위한 키-값 저장소.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `key` | varchar | 기본 키 |
| `value` | varchar | 설정 값 |
| `updatedAt` | timestamp | 마지막 업데이트 시각 |

### roles {#roles}

세분화된 권한을 가진 커스텀 역할.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `name` | varchar | 고유 역할 이름 |
| `description` | varchar | 선택적 설명 |
| `permissions` | jsonb | 권한 문자열의 배열 |
| `createdAt` | timestamp | 생성 시각 |

### audit_log {#audit-log}

보안 관련 작업 로그.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `userId` | uuid | users에 대한 FK |
| `action` | varchar | 작업 유형 |
| `details` | jsonb | 작업별 데이터 |
| `createdAt` | timestamp | 작업 시각 |

## 마이그레이션 {#migrations}

Drizzle이 스키마 마이그레이션을 처리합니다. 마이그레이션 파일은 `apps/api/drizzle/`에 있습니다. 개발 중에는:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

프로덕션에서는 시작 시 대기 중인 마이그레이션이 자동으로 적용됩니다.

## 백업 및 복원 {#backup-and-restore}

관계형 데이터베이스는 앱의 `/data` 볼륨이 아니라 Postgres 컨테이너의 `SnapOtter-pgdata` 볼륨에 있습니다.

**옵션 1: pg_dump (권장)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**옵션 2: 볼륨 스냅샷**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### 1.x(SQLite)에서 마이그레이션 {#migrating-from-1-x-sqlite}

SnapOtter 1.x에서 업그레이드하는 방법은 별도의 가이드가 있습니다. [1.x에서 2.0으로 업그레이드](./upgrading)를 참고하세요. 간단히 말하면, 기존 `/data` 볼륨을 재사용하면 2.0이 첫 부팅 시 `/data/snapotter.db`를 자동으로 감지하고 가져옵니다(또는 `SQLITE_MIGRATE_PATH`를 설정해 명시적으로 지정할 수 있습니다). 먼저 `snapotter.db`만이 아니라 전체 `/data` 볼륨을 백업하세요. 1.x는 SQLite WAL 모드를 사용하므로, 중지된 컨테이너는 거의 비어 있는 `snapotter.db` 옆에 있는 `snapotter.db-wal`에 대부분의 데이터를 남겨두는 경우가 많습니다.
