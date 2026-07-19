---
description: "สคีมาฐานข้อมูล PostgreSQL ตาราง การย้ายข้อมูล และขั้นตอนการสำรองข้อมูลสำหรับ SnapOtter"
i18n_source_hash: 50d5d4f220cf
i18n_provenance: human
i18n_output_hash: b589c2175a16
---

# ฐานข้อมูล {#database}

SnapOtter ใช้ PostgreSQL 17 กับ [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) สำหรับการจัดเก็บข้อมูลอย่างถาวร สคีมาถูกกำหนดไว้ใน `apps/api/src/db/schema.ts`

การเชื่อมต่อถูกกำหนดค่าผ่านตัวแปรสภาพแวดล้อม `DATABASE_URL` (ค่าเริ่มต้น `postgres://snapotter:snapotter@postgres:5432/snapotter`) ใน Docker Compose คอนเทนเนอร์ Postgres จะเก็บข้อมูลไว้ใน named volume `SnapOtter-pgdata`

## ตาราง {#tables}

### users {#users}

เก็บบัญชีผู้ใช้ สร้างขึ้นโดยอัตโนมัติเมื่อรันครั้งแรกจาก `DEFAULT_USERNAME` และ `DEFAULT_PASSWORD`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `username` | varchar | ไม่ซ้ำ จำเป็น |
| `passwordHash` | varchar | scrypt hash |
| `role` | varchar | `admin`, `editor` หรือ `user` |
| `mustChangePassword` | boolean | ธงบังคับรีเซ็ตรหัสผ่าน |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `updatedAt` | timestamp | เวลาที่อัปเดตล่าสุด |

### sessions {#sessions}

เซสชันการเข้าสู่ระบบที่ใช้งานอยู่ แต่ละแถวผูกโทเคนเซสชันกับผู้ใช้

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | varchar | คีย์หลัก (โทเคนเซสชัน) |
| `userId` | uuid | คีย์นอกไปยัง `users.id` |
| `expiresAt` | timestamp | เวลาหมดอายุ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### teams {#teams}

กลุ่มสำหรับจัดระเบียบผู้ใช้ ผู้ดูแลสามารถกำหนดผู้ใช้ให้กับทีมได้

| คอลัมน์ | ชนิด | คำอธิบาย |
|--------|------|-------------|
| `id` | uuid | คีย์หลัก |
| `name` | varchar (ไม่ซ้ำ สูงสุด 50 อักขระ) | ชื่อทีม |
| `createdAt` | timestamp | เวลาที่สร้าง |

### api_keys {#api-keys}

คีย์ API สำหรับการเข้าถึงแบบโปรแกรม คีย์ดิบจะแสดงเพียงครั้งเดียวตอนสร้าง เก็บเฉพาะ hash เท่านั้น

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | คีย์นอกไปยัง `users.id` |
| `keyHash` | varchar | scrypt hash ของคีย์ |
| `name` | varchar | ป้ายชื่อที่ผู้ใช้กำหนด |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `lastUsedAt` | timestamp | อัปเดตทุกครั้งที่มีการร้องขอที่ผ่านการยืนยันตัวตน |

คีย์จะขึ้นต้นด้วย `si_` ตามด้วยอักขระเลขฐานสิบหก 96 ตัว (สุ่ม 48 ไบต์)

### pipelines {#pipelines}

ชุดเครื่องมือที่บันทึกไว้ซึ่งผู้ใช้สร้างขึ้นใน UI

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `name` | varchar | ชื่อ pipeline |
| `description` | varchar | คำอธิบายที่ไม่บังคับ |
| `steps` | jsonb | อาร์เรย์ของอ็อบเจกต์ `{ toolId, settings }` |
| `createdAt` | timestamp | เวลาที่สร้าง |

### user_files {#user-files}

คลังไฟล์ถาวร โดยค่าเริ่มต้น การแก้ไขที่บันทึกไว้จะถูกแทรกเป็นแถวรากอิสระ ("บันทึกเป็นไฟล์ใหม่": `version` 1, `parentId` เป็น null ดังนั้นไฟล์ต้นฉบับยังคงอยู่ในรายการ) หรือเป็นเวอร์ชันที่เชื่อมโยงกับแถวแม่เมื่อคุณเขียนทับไฟล์ต้นฉบับ (กำหนด `parentId`, เพิ่มค่า `version` และแทนที่ไฟล์เดิม) คอลัมน์ `toolChain` บันทึกเครื่องมือที่นำมาใช้

| คอลัมน์ | ชนิด | คำอธิบาย |
|--------|------|-------------|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | FK ไปยัง users (CASCADE DELETE) |
| `originalName` | varchar | ชื่อไฟล์อัปโหลดต้นฉบับ |
| `storedName` | varchar | ชื่อไฟล์บนดิสก์ |
| `mimeType` | varchar | ชนิด MIME |
| `size` | integer | ขนาดไฟล์เป็นไบต์ |
| `width` | integer | ความกว้างของภาพเป็นพิกเซล |
| `height` | integer | ความสูงของภาพเป็นพิกเซล |
| `version` | integer | หมายเลขเวอร์ชัน (1 = ต้นฉบับ) |
| `parentId` | uuid หรือ null | FK ไปยัง user_files (เวอร์ชันแม่) |
| `toolChain` | jsonb | รหัสเครื่องมือที่นำมาใช้ตามลำดับเพื่อสร้างเวอร์ชันนี้ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### jobs {#jobs}

ติดตามงานประมวลผลสำหรับการรายงานความคืบหน้าและการล้างข้อมูล

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `type` | varchar | ตัวระบุเครื่องมือหรือ pipeline |
| `status` | varchar | `queued`, `processing`, `completed` หรือ `failed` |
| `progress` | real | เศษส่วน 0.0-1.0 |
| `inputFiles` | jsonb | อาร์เรย์ของพาธไฟล์อินพุต |
| `outputPath` | varchar | พาธไปยังไฟล์ผลลัพธ์ |
| `settings` | jsonb | การตั้งค่าเครื่องมือที่ใช้ |
| `error` | varchar | ข้อความข้อผิดพลาดหากล้มเหลว |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `completedAt` | timestamp | เวลาที่เสร็จสิ้น |

### settings {#settings}

ที่เก็บแบบคีย์-ค่าสำหรับการตั้งค่าทั้งเซิร์ฟเวอร์ที่ผู้ดูแลสามารถเปลี่ยนได้จาก UI

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `key` | varchar | คีย์หลัก |
| `value` | varchar | ค่าการตั้งค่า |
| `updatedAt` | timestamp | เวลาที่อัปเดตล่าสุด |

### roles {#roles}

บทบาทกำหนดเองพร้อมสิทธิ์แบบละเอียด

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `name` | varchar | ชื่อบทบาทที่ไม่ซ้ำ |
| `description` | varchar | คำอธิบายที่ไม่บังคับ |
| `permissions` | jsonb | อาร์เรย์ของสตริงสิทธิ์ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### audit_log {#audit-log}

บันทึกการกระทำที่เกี่ยวข้องกับความปลอดภัย

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | FK ไปยัง users |
| `action` | varchar | ชนิดการกระทำ |
| `details` | jsonb | ข้อมูลเฉพาะการกระทำ |
| `createdAt` | timestamp | เวลาที่กระทำ |

## การย้ายข้อมูล (Migrations) {#migrations}

Drizzle จัดการการย้ายสคีมา ไฟล์การย้ายข้อมูลอยู่ใน `apps/api/drizzle/` ระหว่างการพัฒนา:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

ในโปรดักชัน การย้ายข้อมูลที่ค้างอยู่จะถูกนำมาใช้โดยอัตโนมัติเมื่อเริ่มต้น

## การสำรองและกู้คืนข้อมูล {#backup-and-restore}

ฐานข้อมูลเชิงสัมพันธ์อยู่ใน volume `SnapOtter-pgdata` ของคอนเทนเนอร์ Postgres ไม่ใช่ volume `/data` ของแอป

**ตัวเลือกที่ 1: pg_dump (แนะนำ)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**ตัวเลือกที่ 2: Volume snapshot**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### การย้ายข้อมูลจาก 1.x (SQLite) {#migrating-from-1-x-sqlite}

การอัปเกรดจาก SnapOtter 1.x มีคู่มือของตัวเอง ดู [การอัปเกรดจาก 1.x ไปยัง 2.0](./upgrading) สรุปสั้นๆ ให้ใช้ volume `/data` ที่มีอยู่เดิมซ้ำ และ 2.0 จะตรวจจับและนำเข้า `/data/snapotter.db` โดยอัตโนมัติเมื่อบูตครั้งแรก (หรือกำหนด `SQLITE_MIGRATE_PATH` เพื่อชี้ไปยังไฟล์นั้นอย่างชัดเจน) สำรอง volume `/data` ทั้งหมดก่อน ไม่ใช่แค่ `snapotter.db`: 1.x ใช้โหมด SQLite WAL ดังนั้นคอนเทนเนอร์ที่หยุดทำงานมักจะทิ้งข้อมูลส่วนใหญ่ไว้ใน `snapotter.db-wal` ข้างๆ `snapotter.db` ที่แทบจะว่างเปล่า
