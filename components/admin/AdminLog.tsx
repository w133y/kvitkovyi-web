"use client";

import { useState, useTransition } from "react";
import { getAdminLogs, clearAdminLogsAction, setErrorLoggingEnabledAction } from "@/lib/actions/admin-log";

type LogEntry = {
  id: string;
  message: string;
  detail: string | null;
  createdAt: string | Date;
};

function formatTime(d: string | Date) {
  return new Date(d).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AdminLog({
  initialLogs,
  initialEnabled,
}: {
  initialLogs: LogEntry[];
  initialEnabled: boolean;
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const fresh = await getAdminLogs();
      setLogs(fresh);
    });
  }

  function clear() {
    if (!confirm("Очистити весь журнал помилок?")) return;
    startTransition(async () => {
      await clearAdminLogsAction();
      setLogs([]);
    });
  }

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      await setErrorLoggingEnabledAction(next);
    });
  }

  return (
    <div className="admin-log">
      <label className="admin-checkbox-label">
        <input type="checkbox" checked={enabled} onChange={toggleEnabled} disabled={pending} />
        Записувати помилки в журнал
      </label>

      <div className="admin-form-actions">
        <button type="button" onClick={refresh} disabled={pending}>
          <i className="fa-solid fa-arrows-rotate"></i> Оновити
        </button>
        <button type="button" onClick={clear} disabled={pending || logs.length === 0}>
          <i className="fa-solid fa-trash"></i> Очистити
        </button>
      </div>

      <p className="admin-privileges-summary">
        {!enabled
          ? "Журнал вимкнено — нові помилки не записуються."
          : logs.length === 0
            ? "Помилок немає."
            : `Останні ${logs.length} записів.`}
      </p>

      <div className="admin-log-list">
        {logs.map((entry) => (
          <div className="admin-log-row" key={entry.id}>
            <div className="admin-log-row-head">
              <span className="admin-log-message">{entry.message}</span>
              <span className="admin-log-time">{formatTime(entry.createdAt)}</span>
            </div>
            {entry.detail && (
              <details className="admin-log-detail">
                <summary>Деталі</summary>
                <pre>{entry.detail}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
