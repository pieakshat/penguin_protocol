import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer"; // <-- Add this import

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
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <Navbar />
        
        {/* Main Content Area */}
        <main className="flex-1">
          {children}
        </main>

        {/* The New Footer */}
        <Footer />
        
      </body>
    </html>
  );
}