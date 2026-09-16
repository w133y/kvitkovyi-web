import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Мапа - Квітковий",
};

export default function MapPage() {
  return (
    <iframe
      src="/live-map"
      title="Мапа серверу"
      style={{ display: "block", width: "100%", height: "100vh", border: "none" }}
      allowFullScreen
    />
  );
}
