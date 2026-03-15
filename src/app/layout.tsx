import type { ReactNode } from "react"
import { Tomorrow } from "next/font/google"
import Header from "@/components/Header"

const tomorrow = Tomorrow({ 
  subsets: ["latin"], 
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap"
})

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs" className={tomorrow.className} style={{ margin: 0, padding: 0, background: "#0A0A0A" }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #0A0A0A; min-height: 100vh; }
          .auth-hero-image {
            flex: 1 1 500px;
            min-height: 40vh;
            background-image: url('/login-imagine.png');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            background-color: #0A0A0A;
          }
          @media (max-width: 600px) {
            .auth-hero-image {
              min-height: 28vh;
              background-size: contain;
              background-position: center bottom;
            }
          }
        `}</style>
      </head>
      <body style={{ fontFamily: "inherit", margin: 0, padding: 0, background: "#0A0A0A", minHeight: "100vh" }}>
        <Header />
        {children}
      </body>
    </html>
  )
}
