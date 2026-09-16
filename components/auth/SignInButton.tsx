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
    </form>
  );
}
