---
description: "สคีมาฐานข้อมูล PostgreSQL ตาราง การย้ายข้อมูล และขั้นตอนการสำรองข้อมูลของ SnapOtter"
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 11e48e0ca011
i18n_hash_version: 2
---

# ฐานข้อมูล {#database}

SnapOtter ใช้ PostgreSQL 17 ร่วมกับ [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) เพื่อเก็บข้อมูลถาวร สคีมากำหนดไว้ใน `apps/api/src/db/schema.ts`

การเชื่อมต่อกำหนดผ่านตัวแปรสภาพแวดล้อม `DATABASE_URL` (ค่าเริ่มต้น `postgres://snapotter:snapotter@postgres:5432/snapotter`) ใน Docker Compose คอนเทนเนอร์ Postgres เก็บข้อมูลไว้ในวอลุ่มที่มีชื่อ `SnapOtter-pgdata` คำขอต่าง ๆ ให้บริการด้วยบทบาทที่อ่านและเขียนแถวได้เท่านั้น ซึ่งอธิบายไว้ใน [บทบาทที่มีสิทธิ์น้อยที่สุด](#least-privilege-roles) ด้านล่าง

## ตาราง {#tables}

### users {#users}

เก็บบัญชีผู้ใช้ สร้างโดยอัตโนมัติในการรันครั้งแรกจาก `DEFAULT_USERNAME` และ `DEFAULT_PASSWORD`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `username` | varchar | ไม่ซ้ำ จำเป็นต้องมี |
| `passwordHash` | varchar | แฮช scrypt |
| `role` | varchar | `admin`, `editor` หรือ `user` |
| `mustChangePassword` | boolean | แฟล็กบังคับรีเซ็ตรหัสผ่าน |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `updatedAt` | timestamp | เวลาที่อัปเดตล่าสุด |

### sessions {#sessions}

เซสชันการเข้าสู่ระบบที่ใช้งานอยู่ แต่ละแถวผูกโทเคนเซสชันกับผู้ใช้หนึ่งราย

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | varchar | คีย์หลัก (โทเคนเซสชัน) |
| `userId` | uuid | คีย์นอกที่อ้างอิง `users.id` |
| `expiresAt` | timestamp | เวลาหมดอายุ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### teams {#teams}

กลุ่มสำหรับจัดระเบียบผู้ใช้ ผู้ดูแลระบบสามารถมอบหมายผู้ใช้เข้าทีมได้

| คอลัมน์ | ชนิด | คำอธิบาย |
|--------|------|-------------|
| `id` | uuid | คีย์หลัก |
| `name` | varchar (ไม่ซ้ำ สูงสุด 50 อักขระ) | ชื่อทีม |
| `createdAt` | timestamp | เวลาที่สร้าง |

### api_keys {#api-keys}

API key สำหรับการเข้าถึงด้วยโปรแกรม คีย์ดิบจะแสดงเพียงครั้งเดียวตอนสร้าง และเก็บเฉพาะแฮช

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | คีย์นอกที่อ้างอิง `users.id` |
| `keyHash` | varchar | แฮช scrypt ของคีย์ |
| `name` | varchar | ป้ายชื่อที่ผู้ใช้ตั้ง |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `lastUsedAt` | timestamp | อัปเดตทุกครั้งที่มีคำขอที่ยืนยันตัวตนแล้ว |

คีย์ขึ้นต้นด้วย `si_` ตามด้วยเลขฐานสิบหก 96 ตัว (ไบต์สุ่ม 48 ไบต์)

### pipelines {#pipelines}

ชุดเครื่องมือที่บันทึกไว้ซึ่งผู้ใช้สร้างใน UI

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `name` | varchar | ชื่อไปป์ไลน์ |
| `description` | varchar | คำอธิบาย (ไม่บังคับ) |
| `steps` | jsonb | อาร์เรย์ของอ็อบเจกต์ `{ toolId, settings }` |
| `createdAt` | timestamp | เวลาที่สร้าง |

### user_files {#user-files}

ไลบรารีไฟล์ถาวร การแก้ไขที่บันทึกจะถูกเพิ่มเป็นแถวรากอิสระโดยค่าเริ่มต้น ("บันทึกเป็นไฟล์ใหม่": `version` เป็น 1, `parentId` เป็น null ไฟล์ต้นฉบับจึงยังอยู่ในรายการ) หรือเป็นเวอร์ชันที่เชื่อมกับต้นทางเมื่อคุณเขียนทับไฟล์ต้นฉบับ (ตั้งค่า `parentId` เพิ่มค่า `version` และแทนที่ไฟล์เดิม) คอลัมน์ `toolChain` บันทึกเครื่องมือที่ใช้

| คอลัมน์ | ชนิด | คำอธิบาย |
|--------|------|-------------|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | FK ไปยัง users (CASCADE DELETE) |
| `originalName` | varchar | ชื่อไฟล์ต้นฉบับที่อัปโหลด |
| `storedName` | varchar | ชื่อไฟล์บนดิสก์ |
| `mimeType` | varchar | ชนิด MIME |
| `size` | integer | ขนาดไฟล์เป็นไบต์ |
| `width` | integer | ความกว้างภาพเป็นพิกเซล |
| `height` | integer | ความสูงภาพเป็นพิกเซล |
| `version` | integer | หมายเลขเวอร์ชัน (1 = ต้นฉบับ) |
| `parentId` | uuid หรือ null | FK ไปยัง user_files (เวอร์ชันต้นทาง) |
| `toolChain` | jsonb | ID ของเครื่องมือที่ใช้ตามลำดับเพื่อสร้างเวอร์ชันนี้ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### jobs {#jobs}

ติดตามงานประมวลผลเพื่อรายงานความคืบหน้าและล้างข้อมูล

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `type` | varchar | ตัวระบุเครื่องมือหรือไปป์ไลน์ |
| `status` | varchar | `queued`, `processing`, `completed` หรือ `failed` |
| `progress` | real | เศษส่วน 0.0-1.0 |
| `inputFiles` | jsonb | อาร์เรย์ของพาธไฟล์อินพุต |
| `outputPath` | varchar | พาธไปยังไฟล์ผลลัพธ์ |
| `settings` | jsonb | การตั้งค่าเครื่องมือที่ใช้ |
| `error` | varchar | ข้อความข้อผิดพลาดหากล้มเหลว |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `completedAt` | timestamp | เวลาที่เสร็จสิ้น |

### settings {#settings}

ที่เก็บแบบคีย์-ค่าสำหรับการตั้งค่าระดับเซิร์ฟเวอร์ที่ผู้ดูแลระบบเปลี่ยนได้จาก UI

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `key` | varchar | คีย์หลัก |
| `value` | varchar | ค่าของการตั้งค่า |
| `updatedAt` | timestamp | เวลาที่อัปเดตล่าสุด |

### roles {#roles}

บทบาทแบบกำหนดเองที่มีสิทธิ์ละเอียด

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `name` | varchar | ชื่อบทบาทที่ไม่ซ้ำ |
| `description` | varchar | คำอธิบาย (ไม่บังคับ) |
| `permissions` | jsonb | อาร์เรย์ของสตริงสิทธิ์ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### audit_log {#audit-log}

บันทึกการกระทำที่เกี่ยวข้องกับความปลอดภัย

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | FK ไปยัง users |
| `action` | varchar | ชนิดของการกระทำ |
| `details` | jsonb | ข้อมูลเฉพาะของการกระทำ |
| `createdAt` | timestamp | เวลาที่กระทำ |

### user_preferences {#user-preferences}

สถานะ UI ของผู้ใช้แต่ละราย แยกตามชื่อค่ากำหนด รองรับเครื่องมือที่ปักหมุดบนแดชบอร์ดผ่าน `PUT /api/v1/preferences`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `userId` | text | FK ไปยัง users ลบแบบต่อเนื่องเมื่อผู้ใช้ถูกลบ เป็นคีย์หลักร่วมกับ `key` |
| `key` | text | ชื่อค่ากำหนด เป็นคีย์หลักร่วมกับ `userId` |
| `value` | jsonb | เพย์โหลดของค่ากำหนด |
| `updatedAt` | timestamp | เวลาที่เขียนล่าสุด |

## การย้ายข้อมูล {#migrations}

Drizzle จัดการการย้ายสคีมา ไฟล์การย้ายข้อมูลอยู่ใน `apps/api/drizzle/` ระหว่างการพัฒนา

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

ในโปรดักชัน การย้ายข้อมูลที่ค้างอยู่จะถูกนำไปใช้โดยอัตโนมัติเมื่อเริ่มต้น

## บทบาทที่มีสิทธิ์น้อยที่สุด {#least-privilege-roles}

สองบทบาท สองหน้าที่ `DATABASE_URL` รับคำขอและมี `SELECT`, `INSERT`, `UPDATE`, `DELETE` บนตารางของแอป รวมถึง `USAGE` และ `SELECT` บนซีเควนซ์ของตารางเหล่านั้น มีเพียงเท่านี้ ไม่สามารถสร้างหรือลบตาราง ติดตั้งส่วนขยาย `TRUNCATE` อ่าน `pg_authid` สร้างฐานข้อมูล แก้ไขบทบาท หรือแตะต้องสคีมา `drizzle` ที่เก็บประวัติการย้ายข้อมูลได้

`DATABASE_MIGRATION_URL` เป็นบทบาทที่มีสิทธิ์สูง รันการย้ายข้อมูลและมอบสิทธิ์ให้บทบาทขณะรันระหว่างบูต แล้วปิดก่อนที่จะรับคำขอแรก

การแยกบทบาทนี้เริ่มใน SnapOtter 2.3.0 ตั้งแต่รุ่นนั้น ไฟล์ Compose ในรีโพและอิมเมจแบบครบในตัวถูกเชื่อมต่อแบบนี้ รวมถึงการติดตั้งที่มีอยู่เดิม เมื่อบูต SnapOtter จะสร้างบทบาทขณะรันหากยังไม่มี มอบสิทธิ์ ย้ายข้อมูล แล้วกวาดมอบสิทธิ์ไปยังตารางที่มีอยู่ก่อนหน้า การอัปเกรดไม่ต้องรัน SQL ด้วยตนเอง

อิมเมจ 2.2.0 อ่านเฉพาะสตริงการเชื่อมต่อขณะรัน และไม่เคยสร้างบทบาทที่สอง ดังนั้นหากตั้งค่าแบบแยกบทบาทให้อิมเมจนั้น มันจะไม่เริ่มทำงาน บันทึกของแอปจะแสดงว่าการยืนยันตัวตนด้วยรหัสผ่านของบทบาทนั้นล้มเหลว และบันทึกของ Postgres จะบอกว่าไม่มีบทบาทนี้ ให้อัปเกรดอิมเมจเป็น 2.3.0 หรือใหม่กว่าก่อนจะเปลี่ยนไฟล์ Compose ไปใช้การแยกบทบาท

หากเว้น `DATABASE_MIGRATION_URL` ว่างไว้ จะทำงานแบบบทบาทเดียว โดยให้ `DATABASE_URL` ทำทั้งสองหน้าที่เหมือนก่อนการแยกบทบาททุกประการ นี่เป็นการกำหนดค่าที่รองรับ ไม่ใช่ที่เลิกใช้แล้ว และเป็นคำตอบที่ถูกต้องบน Postgres แบบมีผู้ให้บริการจัดการ ซึ่งการสร้างบทบาทมักไม่ใช่สิ่งที่คุณทำได้

### Postgres ภายนอกและแบบมีผู้ให้บริการจัดการ {#external-and-managed-postgres}

บน RDS, Supabase, Cloud SQL หรือคลัสเตอร์ใดก็ตามที่คุณรันเอง การแยกบทบาทเป็นทางเลือก สร้างบทบาทขณะรันหนึ่งครั้ง

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

จากนั้นส่งสตริงการเชื่อมต่อทั้งสองให้ SnapOtter โดยชี้ไปที่โฮสต์ พอร์ต และฐานข้อมูลเดียวกัน

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

แค่นี้ก็พอ SnapOtter มอบสิทธิ์เองและมอบซ้ำหลังการย้ายข้อมูลทุกครั้ง ตารางที่เพิ่มในรุ่นถัดไปจึงถูกครอบคลุมโดยไม่ต้องมีใครรัน SQL

บทบาทใน `DATABASE_MIGRATION_URL` ต้องเป็นเจ้าของตารางของ SnapOtter เพราะมีเพียงเจ้าของตารางเท่านั้นที่มอบสิทธิ์บนตารางนั้นได้ ในการติดตั้งที่มีอยู่เดิม หมายถึงบทบาทที่คุณใช้รัน SnapOtter อยู่ ไม่ใช่บทบาทใหม่ที่สร้างขึ้นเพื่อการนี้ หากชี้ไปที่บทบาทใหม่ที่ไม่ได้เป็นเจ้าของอะไรเลย การบูตจะล้มเหลวพร้อมข้อผิดพลาดที่บอกเรื่องนี้ตรง ๆ นอกจากนี้ยังต้องมี `CREATEROLE` เพื่อสร้างและดูแลบทบาทขณะรัน และสิทธิ์สร้างสคีมา `drizzle`

หากระบุบทบาทเดียวกันในทั้งสอง URL การแยกบทบาทจะปิด และ SnapOtter จะบอกไว้ในบันทึกแทนที่จะแสร้งทำเป็นไม่เป็นเช่นนั้น หากผู้ให้บริการไม่มีบทบาทที่เป็นทั้งเจ้าของตารางและมี `CREATEROLE` ให้ใช้แบบบทบาทเดียว

### เหตุผลที่ไม่แตะบิตซูเปอร์ยูสเซอร์ {#why-the-superuser-bit-is-left-alone}

SnapOtter ไม่เคยถอด `SUPERUSER` ออกจากบทบาทใดเอง ในการติดตั้งที่สร้างก่อนการแยกบทบาท `snapotter` เป็นซูเปอร์ยูสเซอร์เพียงรายเดียวของคลัสเตอร์ การลดสิทธิ์จะทำให้คลัสเตอร์ไม่เหลือซูเปอร์ยูสเซอร์เลย และกู้คืนได้เฉพาะผ่านโหมดผู้ใช้เดียวขณะหยุดเซิร์ฟเวอร์ การย้ายการเชื่อมต่อที่ใช้นานไปยังบทบาทที่ถูกจำกัดคือสิ่งที่ให้การป้องกันแทน ซูเปอร์ยูสเซอร์อยู่บนการเชื่อมต่อเพียงไม่กี่วินาทีตอนบูตแล้วก็หายไป

การติดตั้งแบบครบในตัวใหม่ไม่มีปัญหานั้น จะได้สามบทบาท ได้แก่ `postgres` (ซูเปอร์ยูสเซอร์สำหรับบูตสแตรป ไม่ปรากฏในสตริงการเชื่อมต่อใดที่ SnapOtter ใช้) `snapotter` (`NOSUPERUSER` เป็นเจ้าของข้อมูล เชื่อมต่อเฉพาะตอนบูต) และ `snapotter_app` (เฉพาะแถว รับคำขอ)

หากต้องการลดสิทธิ์ `snapotter` รุ่นเก่าอยู่ดี ให้สร้างซูเปอร์ยูสเซอร์ตัวที่สองก่อน และเข้าสู่ระบบด้วยตัวนั้นเพื่อยืนยันว่าใช้งานได้ จากนั้น `ALTER ROLE snapotter NOSUPERUSER`

## การสำรองและกู้คืนข้อมูล {#backup-and-restore}

ฐานข้อมูลเชิงสัมพันธ์อยู่ในวอลุ่ม `SnapOtter-pgdata` ของคอนเทนเนอร์ Postgres ไม่ใช่วอลุ่ม `/data` ของแอป

**การสำรองแบบลอจิคัลพร้อมการตรวจสอบ (แนะนำ)**

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

ทั้งสองคำสั่งเชื่อมต่อเป็น `snapotter` ซึ่งเป็นเจ้าของ และควรทำเช่นนี้ต่อไป บทบาทขณะรันมองไม่เห็นสคีมา `drizzle` ดังนั้นดัมพ์ที่ทำด้วยบทบาทนั้นจะไม่สมบูรณ์ `--no-owner` ปล่อยให้ออบเจ็กต์ที่กู้คืนเป็นของผู้ที่รันการกู้คืน ดังนั้นการรันในฐานะเจ้าของจึงวางความเป็นเจ้าของไว้ตรงที่การมอบสิทธิ์คาดหวัง ข้อควรระวังหนึ่งอย่างบนคลัสเตอร์ใหม่ `pg_dump` มีการมอบสิทธิ์แต่ไม่มีบทบาทที่ระบุชื่อ ดังนั้นให้สร้าง `snapotter_app` ก่อนกู้คืน ไม่เช่นนั้น `--exit-on-error` จะหยุดที่ `GRANT` แรก SnapOtter จะมอบสิทธิ์ซ้ำในการบูตครั้งถัดไปอยู่แล้วไม่ว่ากรณีใด

ดัมพ์ฐานข้อมูลนี้ไม่รวมออบเจ็กต์ไลบรารีที่บันทึกไว้ใน `/data/files` หรือสถานะ BullMQ ที่คงทนใน Redis ให้สำรองและกู้คืนสิ่งเหล่านั้นด้วยขั้นตอนแบบประสานงานใน [ความปลอดภัยและการเสริมความแข็งแกร่ง](/th/guide/security#backup-and-recovery)

**สแนปช็อตวอลุ่มขณะหยุดทำงาน**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

อย่าคัดลอกไดเรกทอรีข้อมูล PostgreSQL ที่กำลังทำงานด้วย `tar` Compose เติมคำนำหน้าชื่อวอลุ่มตามโปรเจกต์ ดังนั้นให้ดู ID ของวอลุ่มที่เมานต์จาก `docker inspect` หรือแพลตฟอร์มจัดเก็บของคุณ แทนที่จะสมมติว่าเป็นป้ายตามตัวอักษร `SnapOtter-pgdata`

### การย้ายจาก 1.x (SQLite) {#migrating-from-1-x-sqlite}

การอัปเกรดจาก SnapOtter 1.x มีคู่มือของตัวเอง ดู [การอัปเกรดจาก 1.x เป็น 2.0](./upgrading) โดยสรุป ให้ใช้วอลุ่ม `/data` เดิมของคุณต่อ แล้ว 2.0 จะตรวจพบและนำเข้า `/data/snapotter.db` ในการบูตครั้งแรก (หรือตั้ง `SQLITE_MIGRATE_PATH` เพื่อชี้ไปที่ไฟล์นั้นโดยตรง) ให้สำรองวอลุ่ม `/data` ทั้งหมดก่อน ไม่ใช่แค่ `snapotter.db` เพราะ 1.x ใช้โหมด WAL ของ SQLite ดังนั้นเมื่อคอนเทนเนอร์หยุด ข้อมูลส่วนใหญ่มักค้างอยู่ใน `snapotter.db-wal` ข้างไฟล์ `snapotter.db` ที่แทบว่างเปล่า
