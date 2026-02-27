import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Privy from "@/context/PrivyProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], style: ['normal', 'italic'], variable: "--font-serif" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Penguin Protocol",
  description: "Isolate Principal. Trade Volatility.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${mono.variable}`}>
<body className={`${inter.variable} antialiased min-h-screen bg-[#0a111a] text-white`}>        <Privy>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            
            {/* Only ONE main tag, and ONE {children}. 
                The flex-1 makes sure the footer stays at the bottom.
            */}
            <main className="flex-1">
              {children}
            </main>

            <Footer />
          </div>
        </Privy>
      </body>
    </html>
  );
}