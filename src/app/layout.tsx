import type { ReactNode } from "react"
import { Tomorrow } from "next/font/google"

const tomorrow = Tomorrow({ 
  subsets: ["latin"], 
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap"
})

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs" className={tomorrow.className} style={{ margin: 0, padding: 0, background: "#0A0A0A" }}>
      <body style={{ fontFamily: "inherit", margin: 0, padding: 0, background: "#0A0A0A", minHeight: "100vh" }}>{children}</body>
    </html>
  )
}
