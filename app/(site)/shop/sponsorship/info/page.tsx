import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Про привілеї - Квітковий",
};

export default function DonateInfoPage() {
  return (
    <div className="donate-page">
      <div className="donate-header">
        <h2>
          <b>Про привілеї</b>
        </h2>
        <p>Детальна інформація про Флориста та Мецената з&apos;явиться тут незабаром.</p>
      </div>
      <div className="donate-signin-prompt">
        <Link href="/shop/sponsorship" className="donate-continue-btn" style={{ width: "auto", padding: "14px 30px" }}>
          Назад
        </Link>
      </div>
    </div>
  );
}
