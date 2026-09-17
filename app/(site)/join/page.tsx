import type { Metadata } from "next";
import Image from "next/image";
import CopyIpButton from "@/components/join/CopyIpButton";

export const metadata: Metadata = {
  title: "Приєднатися - Квітковий",
};

export default function JoinPage() {
  return (
    <>
      <div className="box" id="join-info">
        <div className="boxtext">
          <h2>
            <b>Як приєднатися до серверу?</b>
          </h2>
          <p>
            Для того, щоб приєднатися до пригоди на сервері Квітковий, все, що вам необхідно, —
            це приєднатися за нашою IP-адресою: <b>mc.kvitkovyii.pp.ua</b> з версії <b>1.21+</b> При
            першому вході у вас з&apos;явиться код, який необхідно ввести нашому боту в приватні
            повідомлення <span>Kvitkovy#7712</span>, після чого при повторному підключенні ви
            зможете почати свою пригоду на нашому чудовому сервері!.
          </p>
          <div className="support-buttons">
            <a href="https://discord.gg/qHy6kckJu8" target="_blank" rel="noopener noreferrer" className="join-button">
              <i className="fab fa-discord"></i>Приєднатися до Discord
            </a>
            <CopyIpButton />
          </div>
          <p>
            Наш сервер підтримує як ліцензійні, так і неліцензійні облікові записи. Якщо у вас є
            ліцензія - просто приєднуйтесь та починайте гру! Гравцям без ліцензії необхідно
            зареєструватися за допомогою команди <b>/register пароль пароль</b>. Важливо:
            неліцензійні гравці не можуть використовувати нікнейми, які вже зареєстровані
            ліцензійними користувачами.
          </p>
        </div>
      </div>

      <div className="launcher-box box">
        <div className="launcher-info">
          <h2>
            <b>Лаунчери Minecraft</b>
          </h2>
          <div className="launcher-text">
            <p>
              Строго <span style={{ color: "red" }}>ЗАБОРОНЕНО</span> використовувати TLauncher, TLauncher Legacy, KLauncher,
              Pojav Launcher, FLauncher, SKlauncher та будь-які інші лаунчери, що пов&apos;язані з росією,
              містять віруси або підтримують будь-яку форму читерства.
            </p>
            <h2>
              <b>Яким лаунчером користуватися?</b>
            </h2>
            <p>
              Дозволено користуватися такими лаунчерами, як{" "}
              <a href="https://github.com/voxelum/x-minecraft-launcher" target="_blank" rel="noopener noreferrer">
                X Launcher
              </a>
              ,{" "}
              <a href="https://github.com/PrismLauncher/PrismLauncher" target="_blank" rel="noopener noreferrer">
                PrismLauncher
              </a>
              ,{" "}
              <a href="https://github.com/MultiMC/MultiMC5" target="_blank" rel="noopener noreferrer">
                MultiMC
              </a>{" "}
              та іншими лаунчерами, які не підпадають під зазначені вище обмеження.
            </p>
          </div>
        </div>
        <div className="launcher-image boximage">
          <Image src="/img/launcher.webp" alt="Minecraft launcher meme" width={800} height={600} />
        </div>
      </div>

      <div className="box3">
        <h2>
          <b>Правила</b>
        </h2>
        <div className="rules-container">
          <div className="rules-column">
            <h2>⚔️ Правила гри</h2>
            <p>1.1 Заборонені чіти, експлойти та будь-які модифікації, що дають нечесну перевагу</p>
            <p>1.2 Заборонено мати більше одного акаунту</p>
            <p>1.3 Заборонено красти, знищувати або псувати чужі будівлі та майно</p>
            <p>1.4 Адміністрація має право виносити рішення в ситуаціях, не описаних у правилах</p>
          </div>
          <div className="rules-column">
            <h2>🏗️ Правила будівництва</h2>
            <p>2.1 Заборонено будувати поблизу чужих територій без дозволу власника</p>
            <p>2.2 Заборонені непристойні або образливі споруди</p>
            <p>
              2.3 Масштабні конструкції (ферми, редстоун-механізми), що суттєво навантажують
              сервер, підлягають узгодженню з адміністрацією
            </p>
          </div>
        </div>
        <div className="rules-container">
          <div className="rules-column">
            <h2>💬 Правила спілкування</h2>
            <p>3.1 Спілкування лише українською мовою - у чаті та голосових каналах</p>
            <p>3.2 Заборонено ображати, принижувати або переслідувати гравців</p>
            <p>3.3 Заборонено NSFW-контент і матеріали з насильством</p>
            <p>
              3.4 Заборонена пропаганда комунізму, рашизму та будь-якої ідеології, що виправдовує
              агресію проти України
            </p>
            <p>3.5 Заборонено ділитися контентом з російських ігор - навіть з українською локалізацією</p>
            <p>3.6 Заборонено спам, флуд і надмірне використання Soundpad</p>
          </div>
          <div className="rules-column">
            <h2>🌱 Для нових гравців</h2>
            <p>4.1 Перед початком гри ознайомтеся з усіма правилами</p>
            <p>
              4.2 З питаннями звертайтеся до адміністрації або досвідчених гравців у відповідному
              каналі
            </p>
            <p>
              4.3 Перші порушення можуть отримати попередження замість покарання - за рішенням
              адміністрації
            </p>
          </div>
        </div>
        <div className="rules-container">
          <div className="rules-column full-width">
            <h2>🛡️ Поведінка з адміністрацією</h2>
            <p>5.1 Рішення адміністрації є остаточними та обговоренню в публічному чаті не підлягають</p>
            <p>5.2 Скарги та апеляції подаються виключно через відповідний канал</p>
            <p>5.3 Заборонено видавати себе за представників адміністрації</p>
            <p>
              5.4 Намагання маніпулювати або тиснути на адміністраторів може призвести до
              посиленого покарання
            </p>
          </div>
        </div>
      </div>

      <div className="box">
        <div className="boxtext">
          <h2>
            <b>Насолоджуйтесь грою!</b>
          </h2>
          <p>
            Тепер, коли ви знаєте все необхідне, настав час почати свою пригоду на сервері
            Квітковий! Бажаємо вам приємної гри та неймовірних пригод!
          </p>
        </div>
      </div>
    </>
  );
}
