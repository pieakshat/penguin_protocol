import Hero from "@/components/home/Hero";
import Features from "@/components/home/Features";
import Mechanism from "@/components/home/Mechanism";
import BottomCTA from "@/components/home/BottomCTA";

export default function Home() {
  return (
    // REMOVED the bg-[#050505] from this div so the body's penguin background shows through!
    <div className="w-full flex flex-col min-h-screen">
      
      {/* 1. The majestic penguin intro (transparent so the bg shows) */}
      <Hero />
      
      {/* 2. The core tech value props (these have solid backgrounds to catch the fade) */}
      <Features />
      
      {/* 3. The step-by-step pipeline */}
      <Mechanism />
      
      {/* 4. The final push to the app */}
      <BottomCTA />
    </div>
  );
}