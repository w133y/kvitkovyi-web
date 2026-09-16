"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { checkDonateOrderPayment } from "@/lib/actions/donate-order";

const POLL_INTERVAL_MS = 5000;
const ORDER_TIMEOUT_MS = 10 * 60 * 1000;

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

    const pollInterval = setInterval(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const result = await checkDonateOrderPayment(orderId);
        if ("status" in result) setStatus(result.status);
      } finally {
        inFlight.current = false;
      }
    }, POLL_INTERVAL_MS);

    const countdownInterval = setInterval(() => setRemainingMs(deadline - Date.now()), 1000);

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
