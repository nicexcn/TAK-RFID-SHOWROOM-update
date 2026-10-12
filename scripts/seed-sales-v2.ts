/**
 * Seed v2 (TWC email 12 Oct 2026): the sales referenced by the new auto-fill logic —
 * BU heads for BKK metro (ต้นอ้อ/ปุ๊) + the 8 upcountry province-mapped people.
 * Upserted by ERP-style codes (T-prefix for the new set, names checked against
 * src/lib/salesAutofill.ts so the auto-fill strings match the master EXACTLY).
 *
 * Idempotent: npx tsx scripts/seed-sales-v2.ts   (uses .env DATABASE_URL)
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

// code | name | province coverage (for display; the real mapping logic is salesAutofill.ts)
const SALES: { code: string; name: string; province: string | null; zone?: string | null }[] = [
  { code: "T0001", name: "พรณภัสส์ ปิติธิปตะวัน (ต้นอ้อ)", province: "กรุงเทพและปริมณฑล" },
  { code: "T0002", name: "อารีลักษณ์ เรืองรอง (ปุ๊)", province: "กรุงเทพและปริมณฑล" },
  { code: "T0003", name: "ลลดา เภาราษฎร์ (เอิร์บ)", province: "เชียงใหม่,ลำพูน,ลำปาง,กำแพงเพชร,ตาก" },
  { code: "T0004", name: "สุรีย์พร ประเสริฐกุล (หนูนา)", province: "เชียงราย,พิษณุโลก,นครสวรรค์,แพร่,เพชรบูรณ์,พะเยา,อุตรดิตถ์,สุโขทัย,น่าน,แม่ฮ่องสอน,ชัยนาท,พิจิตร,อุทัยธานี" },
  { code: "T0005", name: "รภัสสา เลาหพูนรังษี (โอ๋)", province: "ขอนแก่น,ชัยภูมิ,นครราชสีมา,มหาสารคาม,กาฬสินธุ์,สระบุรี,ลพบุรี" },
  { code: "T0006", name: "วรวรรณกนก ทองจิระอนันต์ (ดาริณ)", province: "อุดรธานี,หนองคาย,สกลนคร,นครพนม,เลย,หนองบัวลำภู,มุกดาหาร,บึงกาฬ" },
  { code: "T0007", name: "วิชิตชัย โชคชัย (บาส)", province: "อุบลราชธานี,สุรินทร์,บุรีรัมย์,ศรีสะเกษ,ร้อยเอ็ด,ยโสธร,อำนาจเจริญ" },
  { code: "T0008", name: "องค์คุณ อัครไกรวรพันธุ์ (เบียร์)", province: "ชลบุรี,ระยอง,จันทบุรี,ตราด,ฉะเชิงเทรา,ปราจีนบุรี,สระแก้ว,ราชบุรี,กาญจนบุรี,อยุธยา,นครนายก,สุพรรณบุรี,อ่างทอง,สิงห์บุรี,นครปฐม" },
  { code: "T0009", name: "กรวิทย์ เล่าเทียนไชย (มาร์ช)", province: "ภูเก็ต,กระบี่,พังงา,เพชรบุรี,ประจวบ,สมุทรสาคร,สมุทรสงคราม,นครศรีฯ,สุราษฎร์ฯ,ระนอง" },
  { code: "T0010", name: "อดินันท์ ไวยวรรณจิต (นัน)", province: "สงขลา,ปัตตานี,ยะลา,นราธิวาส,สตูล,กระบี่,ชุมพร,ตรัง,พัทลุง" },
];

async function main() {
  // Sanity: every name in salesAutofill's tables must exist here — the auto-fill stores
  // these exact strings on Customer.salesPerson.
  const autofill = readFileSync("src/lib/salesAutofill.ts", "utf8");
  const names = [...autofill.matchAll(/"([^"]+ \([^\)]+\))"/g)].map((m) => m[1]);
  const seeded = new Set(SALES.map((s) => s.name));
  const missing = [...new Set(names)].filter((n) => !seeded.has(n));
  if (missing.length) {
    console.error("salesAutofill references names not in this seed:", missing);
    process.exit(1);
  }

  for (const s of SALES) {
    await prisma.sale.upsert({
      where: { code: s.code },
      update: { name: s.name, province: s.province },
      create: { code: s.code, name: s.name, province: s.province },
    });
  }
  const total = await prisma.sale.count();
  console.log(`seeded ${SALES.length} sales (v2); Sale master total: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
