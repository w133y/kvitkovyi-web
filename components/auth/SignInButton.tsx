import Link from "next/link";
import { signIn } from "@/lib/auth";

export default function SignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("discord");
      }}
    >
      <button type="submit" className="discord-login-btn">
        <img
          src="/icons/discord-icon.png"
          alt=""
          width={31}
          height={31}
          style={{ imageRendering: "pixelated", flexShrink: 0 }}
        />
        <span>Увійти</span>
      </button>
      {/* Shown only where there's room (burger menu, sign-in prompts) — hidden
          in the desktop header pill, see .signin-consent in globals.css. */}
      <p className="signin-consent">
        Входячи, ви погоджуєтесь з <Link href="/terms">Умовами</Link> та{" "}
        <Link href="/privacy">Політикою конфіденційності</Link>.
      </p>
    </form>
  );
}
