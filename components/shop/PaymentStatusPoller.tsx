"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { checkDonateOrderPayment } from "@/lib/actions/donate-order";

const POLL_INTERVAL_MS = 5000;
const ORDER_TIMEOUT_MS = 10 * 60 * 1000;
// How long after the deadline to wait for the final check's answer.
const EXPIRE_GRACE_MS = 15_000;

type Status = "PENDING" | "PAID" | "EXPIRED";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function PaymentStatusPoller({
  orderId,
  initialStatus,
  nickname,
  createdAt,
}: {
  orderId: string;
  initialStatus: Status;
  nickname: string;
  createdAt: string;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const deadline = new Date(createdAt).getTime() + ORDER_TIMEOUT_MS;
  const [remainingMs, setRemainingMs] = useState(() => deadline - Date.now());
  const inFlight = useRef(false);

  useEffect(() => {
    if (status !== "PENDING") return;

    async function poll() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const result = await checkDonateOrderPayment(orderId);
        if ("status" in result) setStatus(result.status);
      } catch {
        // A failed check (network, Donatello/Discord hiccup) must not stop
        // the loop or leave the page waiting forever — the next tick retries.
      } finally {
        inFlight.current = false;
      }
    }

    const pollInterval = setInterval(poll, POLL_INTERVAL_MS);

    // The 10-minute window ends on the client too: one last check once the
    // countdown hits zero (a payment made at the last second still counts),
    // then give up instead of spinning at "0:00" whenever the server's
    // answer never arrives.
    let finalCheckDone = false;
    const countdownInterval = setInterval(() => {
      const left = deadline - Date.now();
      setRemainingMs(left);
      if (left > 0) return;
      if (!finalCheckDone) {
        finalCheckDone = true;
        void poll();
      } else if (left < -EXPIRE_GRACE_MS) {
        setStatus((s) => (s === "PENDING" ? "EXPIRED" : s));
      }
    }, 1000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(countdownInterval);
    };
  }, [orderId, status, deadline]);

  if (status === "PAID") {
    return (
      <div className="donate-payment-status paid">
        <i className="fa-solid fa-circle-check"></i>
        <span>Оплату підтверджено! Привілей активовано.</span>
        <Link href={`/profile/${nickname}`} className="donate-continue-btn" style={{ width: "auto", padding: "10px 24px" }}>
          До профілю
        </Link>
      </div>
    );
  }

  if (status === "EXPIRED") {
    return (
      <div className="donate-payment-status expired">
        <i className="fa-solid fa-circle-xmark"></i>
        <span>Час на оплату сплив (10 хв). Оформіть замовлення ще раз.</span>
        <Link href="/shop/sponsorship" className="donate-continue-btn" style={{ width: "auto", padding: "10px 24px" }}>
          До вибору привілегії
        </Link>
      </div>
    );
  }

  return (
    <div className="donate-payment-status pending">
      <i className="fa-solid fa-spinner fa-spin"></i>
      <span>Очікуємо підтвердження оплати... (залишилось {formatRemaining(remainingMs)})</span>
    </div>
  );
}
