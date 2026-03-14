"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

const PLAN_MAP: Record<string, string> = {
  starter_monthly: "Starter",
  pro_monthly: "Pro",
  studio_monthly: "Studio",
  starter_yearly: "Starter Roční",
  pro_yearly: "Pro Roční",
  studio_yearly: "Studio Roční",
}

export default function AccountPage() {
  const router = useRouter()

  const primary = "#00C8D7"
  const bg = "#0A0A0A"
  const surface = "#1A1A1A"
  const text = "#FFFFFF"

  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const [pass1, setPass1] = useState("")
  const [pass2, setPass2] = useState("")
  const [info, setInfo] = useState("")
  const [error, setError] = useState("")

  const [profile, setProfile] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [loadingSub, setLoadingSub] = useState(true)

  useEffect(() => {
    let canceled = false
    async function init() {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        router.push("/login")
        return
      }
      if (!canceled) {
        setEmail(user.email ?? "")
        const fullName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || ""
        setName(fullName)

        // Fetch profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (!canceled) setProfile(profileData)

        // Fetch subscription
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!canceled) {
          setSubscription(subData)
          setLoadingSub(false)
        }
      }
    }
    init()
    return () => {
      canceled = true
    }
  }, [router])

  async function saveEmail() {
    setError("")
    setInfo("")
    setSavingEmail(true)
    const { error } = await supabase.auth.updateUser({ email })
    setSavingEmail(false)
    if (error) {
      setError(error.message || "Uložení e‑mailu selhalo")
    } else {
      setInfo("Pokud jste změnili e‑mail, dorazí potvrzovací odkaz.")
    }
  }

  async function saveName() {
    setError("")
    setInfo("")
    setSavingName(true)
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } })
    setSavingName(false)
    if (error) {
      setError(error.message || "Uložení jména selhalo")
    } else {
      setInfo("Jméno bylo uloženo")
    }
  }

  async function savePassword() {
    setError("")
    setInfo("")
    if (!pass1 || pass1 !== pass2) {
      setError("Hesla se neshodují")
      return
    }
    setSavingPass(true)
    const { error } = await supabase.auth.updateUser({ password: pass1 })
    setSavingPass(true)
    if (error) {
      setError(error.message || "Změna hesla selhala")
    } else {
      setPass1("")
      setPass2("")
      setInfo("Heslo bylo změněno")
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: bg,
        color: text,
        padding: 24
      }}
    >
      <style>{`
        .account-grid {
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 100px;
          align-items: start;
        }
        .account-feedback {
          padding-top: 64px;
          width: 100%;
        }
        .account-feedback-text {
          text-align: center;
          font-weight: 600;
          line-height: 1.55;
          color: #E5E7EB;
          margin: 0;
        }
        .account-feedback-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 18px;
        }
        .account-feedback-btn {
          background: ${primary};
          color: #000000;
          border: none;
          border-radius: 12px;
          padding: 12px 18px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 220px;
          white-space: nowrap;
        }
        @media (max-width: 1020px) {
          .account-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          .account-feedback {
            padding-top: 0;
          }
          .account-feedback-actions {
            justify-content: center;
          }
          .account-feedback-btn {
            width: 100%;
            min-width: 0;
          }
          .account-feedback-text {
            text-align: center;
          }
        }
      `}</style>

      <div className="account-grid">
        <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Účet</h1>
        </div>

        {error ? <div style={{ color: "#F87171", marginBottom: 12, textAlign: "center" }}>{error}</div> : null}
        {info ? <div style={{ color: primary, marginBottom: 12, textAlign: "center" }}>{info}</div> : null}

        <section
          style={{
            background: surface,
            borderRadius: 16,
            padding: 16,
            border: "1px solid #2A2A2A",
            marginBottom: 16,
            textAlign: "center"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Základní údaje</div>
          <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
            <label style={{ display: "grid", gap: 6, width: "100%" }}>
              <span>E‑mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  background: "#E5E7EB",
                  color: "#111827",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 14px",
                  textAlign: "center"
                }}
              />
            </label>
            <button
              onClick={saveEmail}
              disabled={savingEmail || !email}
              style={{
                justifySelf: "center",
                background: primary,
                color: text,
                border: "none",
                borderRadius: 12,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: savingEmail || !email ? "not-allowed" : "pointer"
              }}
            >
              {savingEmail ? "Ukládám…" : "Uložit e‑mail"}
            </button>

            <label style={{ display: "grid", gap: 6, width: "100%" }}>
              <span>Jméno</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vaše jméno"
                style={{
                  background: "#E5E7EB",
                  color: "#111827",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 14px",
                  textAlign: "center"
                }}
              />
            </label>
            <button
              onClick={saveName}
              disabled={savingName}
              style={{
                justifySelf: "center",
                background: primary,
                color: text,
                border: "none",
                borderRadius: 12,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: savingName ? "not-allowed" : "pointer"
              }}
            >
              {savingName ? "Ukládám…" : "Uložit jméno"}
            </button>
          </div>
        </section>

        <section
          style={{
            background: surface,
            borderRadius: 16,
            padding: 16,
            border: "1px solid #2A2A2A",
            marginBottom: 16,
            textAlign: "center"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Predplatné</div>
          
          {loadingSub ? (
            <div style={{ color: "#9CA3AF" }}>Načítavam...</div>
          ) : (
            <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
              {subscription ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>Typ plánu</div>
                      <div style={{ fontWeight: 600 }}>
                        {PLAN_MAP[profile?.plan] || profile?.plan || 'Free'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>Stav</div>
                      <div>
                        <span style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background: subscription.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : subscription.status === 'canceled' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: subscription.status === 'active' ? '#34D399' : subscription.status === 'canceled' ? '#F87171' : '#FBBF24',
                        }}>
                          {subscription.status === 'active' ? 'Aktívne' : subscription.status === 'canceled' ? 'Zrušené' : subscription.status}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>Kredity</div>
                      <div style={{ fontWeight: 600 }}>{profile?.credits ?? 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>ID předplatného</div>
                      <div style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>
                        {subscription.stripe_subscription_id}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>ID ceny</div>
                      <div style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>
                        {subscription.stripe_price_id || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>Platné do</div>
                      <div style={{ fontWeight: 600 }}>
                        {subscription.current_period_end 
                          ? new Date(subscription.current_period_end * 1000).toLocaleDateString('cs-CZ')
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid #2A2A2A", paddingTop: 12, marginTop: 4, width: "100%" }}>
                    <div style={{ fontSize: 10, color: "#4B5563", fontFamily: "monospace" }}>
                      CID: {profile?.stripe_customer_id || '—'}
                    </div>
                  </div>
                </>
              ) : null}

              <button
                onClick={async () => {
                  try {
                    const { data: { session } } = await supabase.auth.getSession()
                    if (!session?.user) return
                    
                    if (!profile?.stripe_customer_id) {
                      setError("Chyba: Zákaznický účet zatím nebyl vytvořen. Zkuste to prosím za chvíli.")
                      return
                    }

                    const res = await fetch("/api/stripe/portal", {
                      method: "POST",
                      body: JSON.stringify({ userId: session.user.id }),
                    })
                    const data = await res.json()
                    if (data.url) {
                      window.location.href = data.url
                    } else {
                      setError("Chyba při načítání správy předplatného")
                    }
                  } catch (e) {
                    setError("Chyba při komunikaci se serverem")
                  }
                }}
                style={{
                  justifySelf: "center",
                  background: primary,
                  color: text,
                  border: "none",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: 12
                }}
              >
                Spravovat předplatné
              </button>
            </div>
          )}
        </section>

        <section
          style={{
            background: surface,
            borderRadius: 16,
            padding: 16,
            border: "1px solid #2A2A2A",
            textAlign: "center"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Změna hesla</div>
          <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
            <label style={{ display: "grid", gap: 6, width: "100%" }}>
              <span>Nové heslo</span>
              <input
                type="password"
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                style={{
                  background: "#E5E7EB",
                  color: "#111827",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 14px",
                  textAlign: "center"
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, width: "100%" }}>
              <span>Potvrzení hesla</span>
              <input
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                style={{
                  background: "#E5E7EB",
                  color: "#111827",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 14px",
                  textAlign: "center"
                }}
              />
            </label>
            <button
              onClick={savePassword}
              disabled={savingPass || !pass1 || !pass2}
              style={{
                justifySelf: "center",
                background: primary,
                color: text,
                border: "none",
                borderRadius: 12,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: savingPass || !pass1 || !pass2 ? "not-allowed" : "pointer"
              }}
            >
              {savingPass ? "Ukládám…" : "Změnit heslo"}
            </button>
          </div>
        </section>
      </div>
        <div className="account-feedback">
          <p className="account-feedback-text">
            Jsme rádi, že jste si pro tvorbu obsahu pomocí AI vybrali TvorAI. Jsme nová firma a chceme se každý den
            posouvat vpřed a zlepšovat, abychom vám přinesli co nejlepší zážitek. Budeme rádi za zpětnou vazbu – co se
            vám líbí/nelíbí a co zlepšit nebo změnit.
            <br />
            <br />
            Děkujeme,
            <br />
            <span style={{ fontWeight: 900, fontStyle: "italic", color: "#FFFFFF" }}>Tým TvorAI</span>
          </p>
          <div className="account-feedback-actions">
            <a
              className="account-feedback-btn"
              href="https://www.tvorai.cz/napsat-recenzi"
              target="_blank"
              rel="noopener noreferrer"
            >
              Napsat recenzi
            </a>
            <a
              className="account-feedback-btn"
              href="https://www.tvorai.cz/podpora/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Nahlásit chybu/ Myšlenka na změny
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
