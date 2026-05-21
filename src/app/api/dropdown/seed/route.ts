import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const defaultOptions = [
  { type: "brand", value: "LAMITAK" },
  { type: "brand", value: "O2" },
  { type: "brand", value: "O2+" },
  { type: "brand", value: "Dekodur" },
  { type: "brand", value: "Forescolor" },
  { type: "brand", value: "Alvic" },
  { type: "brand", value: "AKUS" },
  { type: "materialType", value: "Laminate" },
  { type: "materialType", value: "Panel" },
  { type: "materialType", value: "Acoustic" },
  { type: "category", value: "Woods" },
  { type: "category", value: "Solids" },
  { type: "category", value: "Patterns" },
  { type: "category", value: "Speciality" },
  { type: "category", value: "Brushed" },
  { type: "category", value: "Structure" },
  { type: "category", value: "Reflective" },
  { type: "category", value: "Magnetic" },
  { type: "category", value: "Syncron" },
  { type: "category", value: "Luxe" },
  { type: "category", value: "Zenit" },
  { type: "category", value: "Zona" },
  { type: "size", value: "1220 x 2440mm" },
  { type: "size", value: "1330 x 2440mm" },
  { type: "size", value: "4'X9'X18mm" },
  { type: "size", value: "1220x2800x12mm" },
  { type: "colour", value: "Light" },
  { type: "colour", value: "Medium" },
  { type: "colour", value: "Dark" },
  { type: "colour", value: "Pigeon" },
  { type: "colour", value: "Battleship" },
  { type: "colour", value: "Hurricane" },
  { type: "colour", value: "Armor" },
  { type: "colour", value: "Anchor" },
  { type: "colour", value: "Sesame" },
  { type: "colour", value: "Blonde" },
  { type: "colour", value: "Milk Tea" },
  { type: "colour", value: "Whip Cream" },
  { type: "colour", value: "Teddy" },
];

export async function GET() {
  try {
    for (const option of defaultOptions) {
      await prisma.dropdownOption.upsert({
        where: { type_value: { type: option.type, value: option.value } },
        update: {},
        create: option,
      });
    }
    return NextResponse.json({ message: "Dropdown options seeded successfully" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}