---
description: "วิธีมีส่วนร่วมกับ SnapOtter รายงานบั๊ก คำขอฟีเจอร์ pull request และข้อกำหนดเรื่อง CLA"
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: 33d63a5f1932
---

# การมีส่วนร่วม {#contributing}

ขอบคุณที่สนใจมีส่วนร่วม คู่มือนี้อธิบายว่าจะเข้าร่วมได้อย่างไร เรารับอะไรบ้าง และจะเริ่มต้นอย่างไร

## วิธีมีส่วนร่วม {#ways-to-contribute}

### Issue (ไม่ต้องตั้งค่าอะไร) {#issues-no-setup-required}

- **รายงานบั๊ก** - มีบางอย่างเสียหายไหม? เปิด [รายงานบั๊ก](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) พร้อมขั้นตอนการทำซ้ำ
- **คำขอฟีเจอร์** - มีไอเดียไหม? เริ่ม [การสนทนา](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) เพื่อให้ชุมชนได้แสดงความเห็นและโหวตสนับสนุน
- **ปัญหาเรื่องการแปล** - เจอคำแปลที่ผิดหรือขาดหายไหม? เปิด [issue เรื่องการแปล](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml)
- **ปัญหาเรื่องเอกสาร** - มีอะไรผิดพลาดในเอกสารไหม? เปิด [issue เรื่องเอกสาร](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml)

### โค้ด (ต้องมี CLA) {#code-requires-cla}

เรารับ pull request สำหรับ:

| ประเภท | ขั้นตอน |
|------|---------|
| การแก้บั๊ก | เปิด PR ได้เลย (ลิงก์ไปยัง issue ถ้ามี) |
| การแปลใหม่ | เปิด PR ได้เลย (ดู [คู่มือการแปล](/th/guide/translations)) |
| การปรับปรุงเอกสาร | เปิด PR ได้เลย |
| การปรับปรุงความครอบคลุมของเทสต์ | เปิด PR ได้เลย |
| เครื่องมือหรือฟีเจอร์ใหม่ | เริ่ม [การสนทนา](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) ก่อน ผู้ดูแลจะแปลงไอเดียที่อนุมัติแล้วเป็น issue ที่ติดตามได้ก่อนที่คุณจะเขียนโค้ด |
| การ refactor หรือเปลี่ยนสถาปัตยกรรม | เริ่ม [การสนทนา](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) ก่อนและรอให้ผู้ดูแลอนุมัติก่อนเขียนโค้ด |

### สิ่งที่เราจะไม่รับ {#what-we-will-not-accept}

- การเปลี่ยนแปลง workflow ของ CI/CD, การตั้งค่า release หรือการตั้งค่า linter/compiler
- PR ที่ไม่มีการลงนาม [Contributor License Agreement](#contributor-license-agreement)
- PR ที่มีการเปลี่ยนแปลงเกิน 400 บรรทัด (แบ่งงานใหญ่ออกเป็น PR ย่อย)
- ฟีเจอร์ที่ไม่ได้ถูกอภิปรายและอนุมัติก่อน
- การเปลี่ยนแปลง `packages/ai/` โดยไม่มีการอภิปรายก่อน

## Contributor License Agreement {#contributor-license-agreement}

ก่อนที่เราจะรวม PR แรกของคุณได้ คุณต้องลงนาม [Individual CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) ของเรา นี่เป็นข้อกำหนดที่ทำเพียงครั้งเดียว

**ทำไม:** SnapOtter มีสัญญาอนุญาตแบบคู่ (AGPLv3 + commercial) CLA ให้สิทธิ์เราในการแจกจ่ายการมีส่วนร่วมของคุณภายใต้สัญญาอนุญาตทั้งสองแบบ คุณยังคงเป็นเจ้าของลิขสิทธิ์เต็มรูปแบบในผลงานของคุณ

**อย่างไร:** เมื่อคุณเปิด PR แรก บอท CLA Assistant จะแสดงความคิดเห็นพร้อมลิงก์ คลิกลิงก์ ทบทวนข้อตกลง และลงนามด้วยบัญชี GitHub ของคุณ ใช้เวลา 30 วินาที

หากคุณมีส่วนร่วมในนามของนายจ้างและนายจ้างของคุณคงไว้ซึ่งสิทธิ์ในทรัพย์สินทางปัญญาเหนือผลงานของคุณ กรุณาติดต่อ contact@snapotter.com เพื่อจัดทำ Corporate CLA ก่อนส่ง

## เริ่มต้นใช้งาน {#getting-started}

### สิ่งที่ต้องมีก่อน {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (สำหรับเครื่องมือ AI เท่านั้น)
- Docker (ไม่บังคับ สำหรับการทดสอบ integration เต็มรูปแบบ)

### การตั้งค่า {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### การรันการตรวจสอบ {#running-checks}

ก่อนส่ง PR ให้แน่ใจว่าการตรวจสอบทั้งหมดผ่านในเครื่องของคุณ:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## ขั้นตอน pull request {#pull-request-process}

1. Fork repo และสร้าง branch จาก `main` (`feat/my-feature` หรือ `fix/issue-123`)
2. ทำการเปลี่ยนแปลงของคุณในคอมมิตที่โฟกัสและตรวจสอบได้ง่ายโดยใช้ [conventional commits](https://www.conventionalcommits.org/)
3. เพิ่มหรืออัปเดตเทสต์สำหรับการเปลี่ยนแปลงของคุณ
4. รัน `pnpm lint && pnpm typecheck && pnpm test` ในเครื่อง
5. เปิด PR เทียบกับ `main` และกรอกแม่แบบ
6. ลงนาม CLA หากได้รับแจ้ง
7. รอให้ CI ผ่านและผู้ดูแลตรวจทาน

### สิ่งที่คาดหวังจากการตรวจทาน {#review-expectations}

- เราตั้งเป้าจะตอบ PR ภายใน 7 วัน
- PR ที่เล็กและโฟกัสจะได้รับการตรวจทานเร็วกว่า
- หากไม่ได้รับการตอบกลับภายใน 7 วัน ให้แสดงความคิดเห็นเพื่อเตือนในเธรด
- เราอาจขอให้เปลี่ยนแปลง แนะนำแนวทางอื่น หรือปิด PR หากไม่สอดคล้องกับทิศทางของโปรเจกต์

### หลังจาก PR ของคุณถูกรวมแล้ว {#after-your-pr-is-merged}

การมีส่วนร่วมของคุณจะถูกรวมไว้ในการรีลีสถัดไปและได้รับเครดิตใน changelog

## Issue ที่เหมาะกับผู้เริ่มต้น {#good-first-issues}

กำลังมองหางานทำอยู่ไหม? ดู [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) ของเราสำหรับงานที่เหมาะกับผู้เริ่มต้น หรือ [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) สำหรับงานใหญ่ที่เรายินดีรับความช่วยเหลือจากชุมชน

## รูปแบบโค้ด {#code-style}

- Biome จัดการการฟอร์แมตและ linting (double quotes, semicolons, การเยื้อง 2 ช่องว่าง)
- Pre-commit hook จะรัน `biome check --write` กับไฟล์ที่ staged โดยอัตโนมัติ
- หาก linter ร้องเรียน ให้แก้ไขโค้ด (อย่าแก้ไขการตั้งค่า Biome)
- ES modules ทุกที่ (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

สำหรับรายละเอียดสถาปัตยกรรมทั้งหมด ดู [คู่มือนักพัฒนา](/th/guide/developer)

## ความปลอดภัย {#security}

**อย่าเปิด PR หรือ issue สาธารณะสำหรับช่องโหว่ด้านความปลอดภัย** รายงานเป็นการส่วนตัวผ่าน [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) หรืออีเมล contact@snapotter.com ดู [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) สำหรับรายละเอียดทั้งหมด

## มีคำถาม? {#questions}

- [เอกสาร](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
