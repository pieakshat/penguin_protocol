"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { bsc } from "viem/chains";

export default function Privy({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || "insert-your-id-here"}
      config={{
        defaultChain: bsc,
        supportedChains: [bsc],
        appearance: {
          theme: "dark",
          accentColor: "#3b82f6",
          showWalletLoginFirst: true,
          logo: "https://your-logo-url.com/logo.png",
        },
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
