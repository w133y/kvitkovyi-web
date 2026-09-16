import Image from "next/image";
import Link from "next/link";

export default function Hero() {
  return (
    <div className="box">
      <div className="boxtext">
        <h2>
          Ласкаво просимо на <b>Квітковий</b>
        </h2>
        <p>
          Найквітучіший ванільний Minecraft RP сервер! Тут на вас чекають неймовірні пригоди,
          творчість і дружня атмосфера.
        </p>
        <div className="buttons-container">
          <Link href="/join" className="custom-button">
            <i className="fa-solid fa-gamepad"></i>
            <span>Почати гру</span>
          </Link>
          <a href="https://discord.gg/qHy6kckJu8" className="custom-button" target="_blank" rel="noopener noreferrer">
            <i className="fa-brands fa-discord"></i>
            <span>Діскорд</span>
          </a>
        </div>
      </div>
      <div className="boximage">
        <Image src="/img/mem_fl.webp" alt="Квітковий" width={800} height={500} priority />
      </div>
    </div>
  );
}
