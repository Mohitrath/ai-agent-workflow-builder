import { Providers } from "./providers";
export const metadata = { title: "AI Workflow Builder" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body style={{fontFamily:"system-ui, sans-serif",margin:0,background:"#0b0d12",color:"#e6e8ee"}}><Providers>{children}</Providers></body></html>; }
