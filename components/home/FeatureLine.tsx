import Image from "next/image";

const FEATURES = [
  {
    icon: "/svg/people.svg",
    title: "Взаємодій",
    text: "Знаходь однодумців, об'єднуйся в громади та бери участь у спільних подіях!",
  },
  {
    icon: "/svg/spark.svg",
    title: "Атмосфера",
    text: "Спілкуйся, відпочивай, отримуй задоволення разом з дружнім колективом.",
  },
  {
    icon: "/svg/city.svg",
    title: "Будуй та розвивай",
    text: "Зводь поселення, відкривай майстерні, створюй економіку та веди торгівлю.",
  },
];

export default function FeatureLine() {
  return (
    <div className="line">
      {FEATURES.map((feature) => (
        <div className="boxline" key={feature.title}>
          <Image className="svg-bottom" src={feature.icon} alt="svg icon" width={100} height={100} />
          <h2>
            <b>{feature.title}</b>
          </h2>
          <p>{feature.text}</p>
        </div>
      ))}
    </div>
  );
}
