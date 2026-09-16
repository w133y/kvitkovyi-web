import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import SignInButton from "@/components/auth/SignInButton";
import CheckoutForm from "@/components/shop/CheckoutForm";

export const metadata: Metadata = {
  title: "Оформлення замовлення - Квітковий",
};

export default async function CheckoutPage() {
  const session = await auth();

  return (
    <div className="box2">
      <div className="lbheader">
        <h2>
          <b>Оформлення замовлення</b>
        </h2>
      </div>

      {!session?.user ? (
        <div className="empty-state" style={{ display: "flex", flexDirection: "column", gap: "20px", alignItems: "center" }}>
          <p>Щоб оформити замовлення, увійдіть через Discord.</p>
          <SignInButton />
        </div>
      ) : (
        <CheckoutForm />
      )}
    </div>
  );
}
