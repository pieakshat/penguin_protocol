"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { bsc } from "viem/chains";

export default function Privy({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      // You can get this ID from the Privy Dashboard (dashboard.privy.io)
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || "insert-your-id-here"}
      config={{
        defaultChain: bsc,
        supportedChains: [bsc],
        appearance: {
          theme: "dark",
          accentColor: "#3b82f6", // Glacial Blue to match the UI
          showWalletLoginFirst: true,
          logo: "https://your-logo-url.com/logo.png", // Optional
        },
        // This allows users to sign in with email/google and get a wallet automatically
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}