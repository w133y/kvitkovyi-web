import type { Metadata } from "next";
import SignInButton from "@/components/auth/SignInButton";

export const metadata: Metadata = {
  title: "Помилка входу - Квітковий",
};

const MESSAGES: Record<string, string> = {
  AccessDenied: "Ви відхилили запит на вхід через Discord.",
  Configuration: "Вхід через Discord тимчасово недоступний. Спробуйте пізніше.",
  Verification: "Посилання для входу застаріло або вже використане.",
  OAuthSignin: "Не вдалося розпочати вхід через Discord.",
  OAuthCallbackError: "Discord не підтвердив вхід. Спробуйте ще раз.",
  OAuthCreateAccount: "Не вдалося створити акаунт через Discord.",
  Callback: "Сталася помилка під час обробки входу.",
  OAuthAccountNotLinked: "Цей Discord-акаунт вже прив'язаний до іншого профілю на сайті.",
};

const DEFAULT_MESSAGE = "Не вдалося увійти через Discord. Спробуйте ще раз.";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = (error && MESSAGES[error]) || DEFAULT_MESSAGE;

  return (
    <div className="box">
      <div className="boxtext">
        <h2>
          <b>Не вдалося увійти</b>
        </h2>
        <p>{message}</p>
        <SignInButton />
      </div>
    </div>
  );
}
