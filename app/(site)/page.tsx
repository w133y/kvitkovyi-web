import { preload } from "react-dom";
import Hero from "@/components/home/Hero";
import FeatureLine from "@/components/home/FeatureLine";
import SupportBox from "@/components/home/SupportBox";
import LeaderboardSection from "@/components/leaderboard/LeaderboardSection";
import TeamCarousel from "@/components/home/TeamCarousel";
import ImageSlider from "@/components/home/ImageSlider";
import JoinCta from "@/components/home/JoinCta";

// Leaderboard data comes from the Minecraft server's DB — refresh periodically
// instead of baking it into the static build or querying on every request.
export const revalidate = 300;

export default function HomePage() {
  // The hero's background (header.webp) is the LCP image but only set in CSS,
  // so the browser would find it after the stylesheet — start it right away.
  preload("/img/header.webp", { as: "image", fetchPriority: "high" });
  return (
    <>
      <Hero />
      <FeatureLine />
      <SupportBox />
      <LeaderboardSection />
      <TeamCarousel />
      <ImageSlider />
      <JoinCta />
    </>
  );
}
