"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getResumableDonateOrder, type ResumableDonateOrder } from "@/lib/actions/donate-order";

const TIER_LABEL = { FLORIST: "Флорист", MECENAT: "Меценат" } as const;

function dismissKey(orderId: string) {
  return `donate-resume-dismissed:${orderId}`;
}

export default function ResumeDonatePrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const [order, setOrder] = useState<ResumableDonateOrder | null>(null);

  // Sponsorship pages (the builder, and the payment page itself) already
  // show this order directly — the prompt is only useful elsewhere, where
  // someone might have wandered off without meaning to abandon it.
  const suppressed = pathname.startsWith("/shop/sponsorship");

  useEffect(() => {
    if (suppressed) return;
    let cancelled = false;
    getResumableDonateOrder().then((result) => {
      if (cancelled || !result) return;
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(dismissKey(result.id)) === "1";
      } catch {
        // localStorage can throw (private mode etc.) — just show the prompt.
      }
      if (!dismissed) setOrder(result);
    });
    return () => {
      cancelled = true;
    };
  }, [suppressed]);

  if (!order || suppressed) return null;

  function dismiss() {
    try {
      localStorage.setItem(dismissKey(order!.id), "1");
    } catch {
      // best-effort — worst case the prompt reappears on the next page
    }
    setOrder(null);
  }

  function resume() {
    router.push(`/shop/sponsorship/payment?order=${order!.id}`);
  }

  return (
    <div className="resume-donate-prompt">
      <p>
        У вас є незавершена оплата — <b>{TIER_LABEL[order.tier]}</b> за {order.amountUah} ₴.
        <br />
        Бажаєте повернутися до оплати?
      </p>
      <div className="resume-donate-prompt-actions">
        <button type="button" className="resume-donate-prompt-yes" onClick={resume}>
          Так
        </button>
        <button type="button" className="resume-donate-prompt-no" onClick={dismiss}>
          Ні
        </button>
      </div>
    </div>
  );
}
