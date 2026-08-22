---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: effc484c9f1a
i18n_hash_version: 2
---
# การกู้คืนบัญชี {#account-recovery}

หากคุณถูกล็อกออกจาก SnapOtter (ส่วนใหญ่มักเกิดจากนโยบาย MFA ที่คุณไม่สามารถ
ทำตามได้อีกต่อไป) คุณสามารถกู้คืนได้จากภายในคอนเทนเนอร์โดยไม่ต้องใช้ไคลเอนต์
ฐานข้อมูล คำสั่งกู้คืนทำงานแบบออฟไลน์และต้องมีสิทธิ์เข้าถึงเชลล์ของคอนเทนเนอร์
ซึ่งนั่นหมายถึงการมีสิทธิ์ควบคุมอินสแตนซ์อย่างเต็มที่อยู่แล้ว

## ฉันติดกำแพงด่านไหน? {#which-wall-am-i-hitting}

การเข้าสู่ระบบของ SnapOtter ใช้ด่าน MFA อิสระสองด่าน ให้วินิจฉัยก่อน:

```bash
docker exec -it snapotter snapotter-admin status
```

คำสั่งนี้จะพิมพ์นโยบาย MFA ปัจจุบันและผู้ใช้รายใดที่ลงทะเบียน TOTP ไว้

- **"MFA enrollment is required before login" (และคุณไม่เคยตั้งค่าแอปเลย):**
  นโยบายกำหนดให้ต้องใช้ MFA แต่คุณยังไม่ได้ลงทะเบียน ให้ผ่อนคลายนโยบาย
- **คุณถูกขอรหัสที่คุณสร้างไม่ได้** (ทำโทรศัพท์หายและรหัสกู้คืน
หายด้วย): บัญชีของคุณได้ลงทะเบียนไว้แล้ว ให้ล้างการลงทะเบียนนั้น

## ผ่อนคลายนโยบาย MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

คำสั่งนี้จะตั้งนโยบายกลับไปเป็น `optional` โดยจะมีผลในการเข้าสู่ระบบครั้งถัดไปโดยไม่ต้อง
รีสตาร์ท คำสั่งนี้จะตั้งค่าเป็น `optional` เท่านั้น จึงไม่สามารถเปิดการบังคับใช้กลับมาได้

## ล้างการลงทะเบียน TOTP ของผู้ใช้รายหนึ่ง {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

หากนโยบายยังคงกำหนดให้ผู้ใช้รายนั้นต้องใช้ MFA พวกเขาจะไปติดกำแพงการลงทะเบียน
ในครั้งถัดไป ดังนั้นให้รัน `reset-mfa-policy` ด้วย จากนั้นเข้าสู่ระบบและลงทะเบียนใหม่จากการตั้งค่า

## อิมเมจรุ่นเก่าและทางเลือกสำรอง {#older-images-and-fallbacks}

บนอิมเมจที่สร้างขึ้นก่อนที่ตัวห่อ `snapotter-admin` จะมีอยู่ ให้เรียกสคริปต์
โดยตรง:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

ในทางเลือกสุดท้ายบนทุกเวอร์ชัน ให้ตั้งค่านโยบายในฐานข้อมูล บนอิมเมจ
แบบออลอินวัน Postgres จะทำงานอยู่ภายในคอนเทนเนอร์:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

บนการตั้งค่าแบบหลายคอนเทนเนอร์ ให้ชี้ `psql` ไปยัง `DATABASE_URL` ของคุณเองแทน

## ถูกล็อกออกจาก SSO ไม่ใช่ MFA? {#locked-out-of-sso-not-mfa}

หากการเข้าสู่ระบบ SSO ที่ถูกบังคับใช้ล้มเหลว ให้ใช้บัญชีท้องถิ่นสำหรับกรณีฉุกเฉินแทน:
ตั้งค่า `ssoBreakGlassUsername` ให้เป็นผู้ดูแลระบบท้องถิ่นภายใต้การตั้งค่า > ความปลอดภัยก่อนที่คุณจะ
บังคับใช้ SSO แล้วเข้าสู่ระบบด้วยรหัสผ่านของบัญชีนั้น
