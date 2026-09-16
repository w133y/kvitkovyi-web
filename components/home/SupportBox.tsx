const FEATURES = [
  {
    icon: "fa-solid fa-ticket",
    title: "Система тикетів",
    text: "Зручна система звернень до адміністрації через Discord для швидкого вирішення питань",
  },
  {
    icon: "fa-solid fa-bug-slash",
    title: "Швидкий фікс багів",
    text: "Наша команда оперативно виправляє знайдені баги та технічні проблеми",
  },
  {
    icon: "fa-solid fa-comments",
    title: "Прислухаємося до гравців",
    text: "Ваші ідеї та пропозиції важливі для нас - разом ми робимо сервер кращим",
  },
  {
    icon: "fa-solid fa-clock",
    title: "Швидка відповідь",
    text: "Підтримка онлайн щодня, відповідаємо на звернення протягом години",
  },
];

export default function SupportBox() {
  return (
    <div className="support-box box">
      <div className="boxtext">
        <h2>
          Турботлива <b>Підтримка</b>
        </h2>
        <div className="support-features">
          {FEATURES.map((feature) => (
            <div className="feature" key={feature.title}>
              <i className={feature.icon}></i>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>
        <div className="buttons-container">
          <a
            href="https://discord.gg/Fj5a59qKvJ"
            className="custom-button"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fa-solid fa-headset"></i>
            <span>Звернутися до підтримки</span>
          </a>
        </div>
      </div>
    </div>
  );
}
