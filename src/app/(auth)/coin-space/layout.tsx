import type { ReactNode } from "react";
import { PrivateCoinSpaceChrome } from "./PrivateCoinSpaceChrome";

export default function CoinSpaceLayout({ children }: { children: ReactNode }) {
  return <PrivateCoinSpaceChrome>{children}</PrivateCoinSpaceChrome>;
}
