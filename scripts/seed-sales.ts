/**
 * Seed the Sales master list (TAK feedback slides 3+28) from the TWC HR export.
 * Run: npx tsx scripts/seed-sales.ts   (DATABASE_URL must point at the target DB)
 *
 * Upserts by `code`, so re-running updates names and never duplicates.
 */
import { PrismaClient } from "@prisma/client";

const SALES: { code: string; name: string }[] = [
  { code: "B0002", name: "นางจอมจันทร์ หิมะมาน" },
  { code: "B0006", name: "น.ส.ประฏาจรา สินโพธิ์" },
  { code: "B0007", name: "น.ส.ชัญญา สุทธิวรรณ" },
  { code: "B0010", name: "น.ส.ปราณี รังโปฎก" },
  { code: "B0012", name: "น.ส.ธนิศา ชัยวงศ์วุฒิกุล" },
  { code: "B0017", name: "น.ส.ชยาพร วุฒิเวชช์" },
  { code: "B0024", name: "น.ส.ณัฎยา ศรีบัว" },
  { code: "B0025", name: "นางสาวเอมอร สุ่ยสนธิ์" },
  { code: "B0026", name: "น.ส.พนิดา สิริกุลชัยนันท์" },
  { code: "B0028", name: "น.ส.กิ่งกาญจน์ เปรมโรจน์" },
  { code: "B0031", name: "นางสาวนฤมล ยีมะลี" },
  { code: "B0034", name: "น.ส.ขวัญชยา อภิเชษฐ์ชูเกียรติ" },
  { code: "B0049", name: "น.ส.รภัสสา เลาหพูนรังษี" },
  { code: "B0053", name: "น.ส.พิชาพัทธ์ ดำรงพลาสิทธิ์" },
  { code: "B0054", name: "น.ส.ธนานิษฐ์ ศศิมงคลวิทย์" },
  { code: "B0066", name: "นายธนกฤต แดงพาณิชย์กุล" },
  { code: "B0071", name: "นายกรวิทย์ เล่าเทียนไชย" },
  { code: "B0075", name: "น.ส.กรวรรณ จันทรเสรีกุล" },
  { code: "B0080", name: "น.ส.วรรณิศา โบราณมูล" },
  { code: "B0083", name: "น.ส.ลลดา เภาราษฎร์" },
  { code: "B0087", name: "นายองค์คุณ อัครไกรวรพันธุ์" },
  { code: "B0088", name: "น.ส.สุววรณา เปรมปลื้ม" },
  { code: "B0097", name: "น.ส.พรณภัสส์ ปิติธิปตะวัน" },
  { code: "B0101", name: "น.ส.แพรวดี จั่นสมโภชน์" },
  { code: "B0107", name: "น.ส.อรนิดา ประสิทธิธรรม" },
  { code: "B0109", name: "น.ส.ธิดารัตน์ ศรีโกมลศิลป์" },
  { code: "B0113", name: "น.ส.วรวรรณกนก ทองจิระอนันต์" },
  { code: "B0114", name: "น.ส.ธนิตาภรณ์ สุทธิพงศ์" },
  { code: "B0116", name: "น.ส.หยาดทิพย์ ตั้งเกียรติวุฒิ" },
  { code: "B0117", name: "นายสรายุทธ์ วินัยธรรม" },
  { code: "B0119", name: "นายภูชร ดวงดิษฐ์" },
  { code: "B0122", name: "น.ส.ณัฐณี เพชรคชสิทธิ์" },
  { code: "B0124", name: "น.ส.ภรณ์ทิพย์ อภิวัฒนาเจริญกุล" },
  { code: "B0125", name: "น.ส. อรอนงค์ หลักคำ" },
  { code: "B0128", name: "น.ส.ธิดารัตน์ ชัยรัตน์" },
  { code: "B0136", name: "น.ส.ปิ่นมณี สร้อยนาค" },
  { code: "B0141", name: "นางสาวจุฬาภรณ์ วงศ์พินนท์" },
  { code: "B0142", name: "น.ส.เพียงวลี มีสวัสดิ์" },
  { code: "B0161", name: "นางสาวฐิติชญาณ์ กิติสาร" },
  { code: "B0171", name: "นางสาวกัลย์ธิดา คำสอน" },
  { code: "B0173", name: "คุณจิรายุ รามสูตร" },
  { code: "B0178", name: "นางสาวจิรณัฐ พิณโนเอก" },
  { code: "C0108", name: "นางอลิสา วิธุรัติ" },
  { code: "C0117", name: "นางสาวเขมณัฎฐ์ อดิศัยสิริบุตร" },
  { code: "C0120", name: "นายสมบัติ วิศิษฎ์ธีระกุล" },
  { code: "W0001", name: "คุณรญาดา เพิ่มทรัพยสกุล" },
  { code: "W0004", name: "คุณอารีลักษณ์ เรืองรอง" },
  { code: "W0009", name: "คุณเบญจพร ลิมปพยอม" },
  { code: "W0011", name: "กัญญารัตน์ เพ็งสุนทร" },
  { code: "W0017", name: "คุณขวัญเทวี ถิโรภาส" },
  { code: "W0022", name: "คุณณัฐวดี รุจกสิกิจนำชัย" },
  { code: "W0026", name: "คุณวรรณวนัช งามจรัส" },
  { code: "W0029", name: "คุณศิรินทรา ทาศรี" },
  { code: "W0032", name: "คุณกรกนก สุขสมสิน" },
  { code: "W0035", name: "คุณชัชชฎา รุ่งไกรศรี" },
  { code: "W0036", name: "คุณภาราดร สวะวิบูลย์" },
  { code: "W0037", name: "คุณวิบูลย์ลักษณ์ เทพหัสดิน ณ อยุธยา" },
  { code: "W0039", name: "สุรีย์พร ประเสริฐกุล" },
  { code: "W0041", name: "อดินันท์ ไวยวรรณจิต" },
  { code: "W0043", name: "นายธนกฤต หนูวรรณะ" },
  { code: "W0044", name: "คุณวิชิตชัย โชคชัย" },
  { code: "W0046", name: "คุณจิณณ์ณณัช มีเดช" },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const s of SALES) {
      await prisma.sale.upsert({ where: { code: s.code }, update: { name: s.name }, create: s });
    }
    console.log(`Seeded ${SALES.length} sales.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
