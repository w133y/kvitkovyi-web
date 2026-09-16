import ProductCard from "./ProductCard";

type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
};

export default function ProductGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return <div className="empty-state">Тут поки що порожньо — товари незабаром з&apos;являться.</div>;
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
