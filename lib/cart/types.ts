export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
  quantity: number;
};
