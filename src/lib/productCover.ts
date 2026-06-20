import { prisma } from "@/lib/prisma";

// Keep Product.imageUrl (the cover/thumbnail) in sync with the FIRST gallery image
// (order asc). Called whenever a ProductImage is added/removed/reordered. Null when empty.
export async function syncCover(productId: string): Promise<void> {
  const first = await prisma.productImage.findFirst({
    where: { productId },
    orderBy: { order: "asc" },
    select: { url: true },
  });
  await prisma.product.update({ where: { id: productId }, data: { imageUrl: first?.url ?? null } });
}
