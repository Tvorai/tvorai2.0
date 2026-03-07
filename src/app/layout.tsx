import type { ReactNode } from "react"
import { Tomorrow } from "next/font/google"

const tomorrow = Tomorrow({ 
  subsets: ["latin"], 
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap"
})

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs" className={tomorrow.className}>
      <body style={{ fontFamily: "inherit" }}>{children}</body>
    </html>
  )
}
