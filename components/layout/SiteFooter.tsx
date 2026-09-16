import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-main">
          <div className="footer-logo">
            <img src="/icon.ico" alt="Server Icon" className="server-icon" />
            <span className="server-name">Квітковий</span>
          </div>

          <nav className="footer-nav">
            <Link href="/">Головна</Link>
            <Link href="/join">Приєднатися</Link>
          </nav>

          <div className="social-links">
            <a href="https://discord.gg/qHy6kckJu8" className="social-icon" target="_blank" rel="noopener noreferrer">
              <i className="fab fa-discord"></i>
            </a>
            <a
              href="https://www.youtube.com/@%D0%9A%D0%B2%D1%96%D1%82%D0%BA%D0%BE%D0%B2%D0%B8.%D0%B9"
              className="social-icon"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fab fa-youtube"></i>
            </a>
            <a href="https://www.tiktok.com/@kvitkovijua" className="social-icon" target="_blank" rel="noopener noreferrer">
              <i className="fab fa-tiktok"></i>
            </a>
            <a href="https://www.instagram.com/kvitkovy.i/" className="social-icon" target="_blank" rel="noopener noreferrer">
              <i className="fab fa-instagram"></i>
            </a>
          </div>

          <a href="https://discord.gg/Fj5a59qKvJ" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <button className="contact-button" type="button">
              Зв&apos;язатися з нами
            </button>
          </a>
        </div>

        <div className="footer-bottom">
          <p className="copyright">© Kvitkoviy 2024-2026</p>
          <p className="disclaimer">Ми не пов&apos;язані з Mojang AB</p>
        </div>
      </div>
    </footer>
  );
}
