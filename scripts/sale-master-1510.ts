/**
 * 15/10 (TAK feedback): Sale master reset —
 *  "Setting หน้า Sale manage เคลียร์รายชื่อเก่าที่มีอยู่ให้หมด เอาแค่ชื่อที่ได้จาก Excel ล่าสุด"
 *
 * 1. Deletes every Sale row that is NOT one of the 10 v2 (T-code) people.
 *    (Full pre-run backup: /home/admin/DEV/project-tak/sale-master-backup-2026-10-16.json
 *     — 72 rows incl. all B/C/W codes. Customers keep their stored salesPerson text.)
 * 2. Upserts the 10 v2 rows and sets อาชีพที่ดูแล (segment) on the two BU heads.
 *
 * Idempotent: npx tsx scripts/sale-master-1510.ts   (uses .env DATABASE_URL)
 * Run on BOTH databases (Cloud Supabase + on-prem self-host).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Segment values follow BU_HEAD_BY_SEGMENT keys in src/lib/salesAutofill.ts.
const SALES: { code: string; name: string; segment: string | null; province: string | null }[] = [
  { code: "T0001", name: "พรณภัสส์ ปิติธิปตะวัน (ต้นอ้อ)", segment: "Architect,Interior,OwnerDev", province: "กรุงเทพและปริมณฑล" },
  { code: "T0002", name: "อารีลักษณ์ เรืองรอง (ปุ๊)", segment: "Turnkey,Contractor,Homeowner", province: "กรุงเทพและปริมณฑล" },
  { code: "T0003", name: "ลลดา เภาราษฎร์ (เอิร์บ)", segment: null, province: "เชียงใหม่,ลำพูน,ลำปาง,กำแพงเพชร,ตาก" },
  { code: "T0004", name: "สุรีย์พร ประเสริฐกุล (หนูนา)", segment: null, province: "เชียงราย,พิษณุโลก,นครสวรรค์,แพร่,เพชรบูรณ์,พะเยา,อุตรดิตถ์,สุโขทัย,น่าน,แม่ฮ่องสอน,ชัยนาท,พิจิตร,อุทัยธานี" },
  { code: "T0005", name: "รภัสสา เลาหพูนรังษี (โอ๋)", segment: null, province: "ขอนแก่น,ชัยภูมิ,นครราชสีมา,มหาสารคาม,กาฬสินธุ์,สระบุรี,ลพบุรี" },
  { code: "T0006", name: "วรวรรณกนก ทองจิระอนันต์ (ดาริณ)", segment: null, province: "อุดรธานี,หนองคาย,สกลนคร,นครพนม,เลย,หนองบัวลำภู,มุกดาหาร,บึงกาฬ" },
  { code: "T0007", name: "วิชิตชัย โชคชัย (บาส)", segment: null, province: "อุบลราชธานี,สุรินทร์,บุรีรัมย์,ศรีสะเกษ,ร้อยเอ็ด,ยโสธร,อำนาจเจริญ" },
  { code: "T0008", name: "องค์คุณ อัครไกรวรพันธุ์ (เบียร์)", segment: null, province: "ชลบุรี,ระยอง,จันทบุรี,ตราด,ฉะเชิงเทรา,ปราจีนบุรี,สระแก้ว,ราชบุรี,กาญจนบุรี,อยุธยา,นครนายก,สุพรรณบุรี,อ่างทอง,สิงห์บุรี,นครปฐม" },
  { code: "T0009", name: "กรวิทย์ เล่าเทียนไชย (มาร์ช)", segment: null, province: "ภูเก็ต,กระบี่,พังงา,เพชรบุรี,ประจวบ,สมุทรสาคร,สมุทรสงคราม,นครศรีฯ,สุราษฎร์ฯ,ระนอง" },
  { code: "T0010", name: "อดินันท์ ไวยวรรณจิต (นัน)", segment: null, province: "สงขลา,ปัตตานี,ยะลา,นราธิวาส,สตูล,กระบี่,ชุมพร,ตรัง,พัทลุง" },
];

async function main() {
  const keep = new Set(SALES.map((s) => s.code));
  const before = await prisma.sale.findMany({ select: { code: true } });
  const doomed = before.filter((s) => !keep.has(s.code));
  if (doomed.length) {
    await prisma.sale.deleteMany({ where: { code: { notIn: [...keep] } } });
  }
  for (const s of SALES) {
    await prisma.sale.upsert({
      where: { code: s.code },
      update: { name: s.name, segment: s.segment, province: s.province, zone: null },
      create: { code: s.code, name: s.name, segment: s.segment, province: s.province },
    });
  }
  const total = await prisma.sale.count();
  console.log(`deleted ${doomed.length} old rows (${doomed.map((d) => d.code).slice(0, 5).join(",")}…); kept/upserted ${SALES.length}; Sale master total: ${total}`);
  if (total !== SALES.length) throw new Error(`expected ${SALES.length} rows, found ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
