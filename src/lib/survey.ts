// #3: Satisfaction survey ("Nimitrlab Experience Survey") — mirrors the Google Form
// (https://forms.gle/mvTjd6ikAM92dBJFA). Questions are fixed here; responses store answers
// keyed by `key`. Rendered on the public /survey page; aggregated on /admin/survey.

export type SurveyItem =
  | { type: "section"; title: string }
  | { key: string; type: "radio" | "checkbox"; title: string; options: string[] }
  | { key: string; type: "scale"; title: string; scale: number }
  | { key: string; type: "text"; title: string };

export const SURVEY_TITLE = "Nimitrlab Experience Survey";

export const SURVEY_ITEMS: SurveyItem[] = [
  { key: "role", type: "radio", title: "You are a… / คุณคือ…", options: [
    "Architect / สถาปนิก", "Interior Designer / นักออกแบบภายใน", "Contractor / ผู้รับเหมา",
    "Turnkey Service / รับเหมาแบบครบวงจร", "Developer / ผู้พัฒนาโครงการ", "Homeowner / เจ้าของบ้าน", "Student / นักศึกษา",
  ] },
  { key: "purpose", type: "checkbox", title: "What brings you to Nimitrlab today? / วันนี้คุณมาเยี่ยมชม Nimitrlab เพื่ออะไร", options: [
    "Looking for materials for a project / หา Material สำหรับโปรเจกต์", "Seeking inspiration and ideas / หาแรงบันดาลใจและไอเดียใหม่ ๆ",
    "Learning about new products / ศึกษาสินค้าและวัสดุใหม่", "Attending event or workshop / เข้าร่วมกิจกรรม", "General visit / เยี่ยมชมทั่วไป",
  ] },
  { type: "section", title: "Your Experience" },
  { key: "overall", type: "scale", title: "Overall, how was your Nimitrlab experience? / ประสบการณ์โดยรวมของคุณเป็นอย่างไร", scale: 5 },
  { key: "areas", type: "checkbox", title: "Which area did you enjoy or find useful? / พื้นที่ไหนที่คุณสนใจหรือเป็นประโยชน์กับคุณมากที่สุด", options: [
    "Material Library / ห้องสมุดวัสดุ", "Moodboard Area / มู้ดบอร์ด", "Re:Make Lab / สถานีวัสดุ",
    "Meeting & Collaboration Space / พื้นที่พักผ่อนและประชุม", "Exhibition Area / ห้องจัดแสดงนิทัศการ",
  ] },
  { key: "visit", type: "checkbox", title: "What describes your visit best? / สิ่งที่คุณได้รับจากการเยี่ยมชมครั้งนี้", options: [
    "Found suitable materials / พบวัสดุที่ตรงความต้องการ", "Got new design ideas / ได้รับไอเดียใหม่",
    "Better understanding of products / เข้าใจสินค้าเพิ่มขึ้น", "Connected with our team / ได้รับคำแนะนำจากทีมงาน", "Still looking / exploring / อยู่ระหว่างค้นหา",
  ] },
  { type: "section", title: "Our Service Experience" },
  { key: "service", type: "scale", title: "How satisfied are you with our team’s service? / คุณพึงพอใจกับการให้บริการของทีม Nimitrlab มากน้อยเพียงใด (1 = น้อยที่สุด, 5 = มากที่สุด)", scale: 5 },
  { key: "team_able", type: "checkbox", title: "Our team was able to… / ทีมงานของเราสามารถ…", options: [
    "Understand your needs / เข้าใจความต้องการของคุณ", "Provide clear product information / ให้ข้อมูลสินค้าได้อย่างชัดเจน",
    "Recommend suitable materials & solutions / แนะนำวัสดุหรือ Solution ที่เหมาะสม", "Inspire new ideas for your project / ช่วยสร้างแรงบันดาลใจหรือไอเดียใหม่ ๆ",
  ] },
  { key: "team_desc", type: "checkbox", title: "How would you describe your experience with our team? / คุณรู้สึกอย่างไรกับการให้บริการของทีมเรา", options: [
    "Professional / เป็นมืออาชีพ", "Knowledgeable / มีความรู้ ความเชี่ยวชาญ", "Friendly & welcoming / เป็นกันเองและเข้าถึงง่าย",
    "Creative & inspiring / ช่วยสร้างแรงบันดาลใจ", "Need improvement / ควรปรับปรุง",
  ] },
  { key: "comments", type: "text", title: "Any comments or suggestions for our team? / ความคิดเห็นหรือข้อเสนอแนะเพิ่มเติมสำหรับทีมงาน" },
];

/** Answerable questions (excludes section headers). */
export const SURVEY_QUESTIONS = SURVEY_ITEMS.filter((i): i is Exclude<SurveyItem, { type: "section" }> => i.type !== "section");
