import Link from "next/link";

export default function JoinCta() {
  return (
    <section className="join-section">
      <div className="join-content">
        <h2>
          <b>Вже вирішив?</b>
        </h2>
        <p>Приєднуйся до нашої спільноти та розпочни свою пригоду прямо зараз!</p>
        <Link href="/join" className="join-button">
          <i className="fas fa-rocket"></i>Почати пригоду
        </Link>
      </div>
    </section>
  );
}
