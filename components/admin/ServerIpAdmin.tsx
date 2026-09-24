"use client";

import { useState, useTransition } from "react";
import { setServerInfo } from "@/lib/actions/site-pages";

// The Minecraft server address + version shown on /join, copied by its
// button and sent in the Discord welcome DM.
export default function ServerIpAdmin({ initialIp, initialVersion }: { initialIp: string; initialVersion: string }) {
  const [saved, setSaved] = useState({ ip: initialIp, version: initialVersion });
  const [ip, setIp] = useState(initialIp);
  const [version, setVersion] = useState(initialVersion);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const unchanged = ip.trim() === saved.ip && version.trim() === saved.version;

  function save() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await setServerInfo(ip, version);
      if ("error" in result) return setError(result.error);
      setSaved({ ip: result.serverIp, version: result.serverVersion });
      setIp(result.serverIp);
      setVersion(result.serverVersion);
      setDone(true);
    });
  }

  return (
    <div className="admin-gallery-settings">
      <p className="admin-privileges-summary">
        Показується на сторінці «Приєднатися», копіюється кнопкою «Копіювати IP» і підставляється у вітання в Discord.
      </p>
      <label className="admin-field">
        IP-адреса сервера
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="mc.kvitkovyi.pp.ua" />
      </label>
      <label className="admin-field">
        Версія
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="26.2" />
      </label>
      {error && <p className="profile-bio-error">{error}</p>}
      {done && <p className="admin-luckperms-success">Збережено.</p>}
      <div className="admin-form-actions">
        <button type="button" onClick={save} disabled={pending || unchanged}>
          {pending ? "Зберігаємо..." : "Зберегти"}
        </button>
      </div>
    </div>
  );
}
