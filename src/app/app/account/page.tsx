'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function AccountPage() {
  const router = useRouter()

  const primary = '#00C8D7'
  const bg = '#0A0A0A'
  const surface = '#1A1A1A'
  const text = '#FFFFFF'

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let canceled = false
    async function init() {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        router.push('/login')
        return
      }
      if (!canceled) {
        setEmail(user.email ?? '')
        const fullName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || ''
        setName(fullName)
      }
    }
    init()
    return () => {
      canceled = true
    }
  }, [router])

  async function saveEmail() {
    setError('')
    setInfo('')
    setSavingEmail(true)
    const { error } = await supabase.auth.updateUser({ email })
    setSavingEmail(false)
    if (error) {
      setError(error.message || 'Uložení e‑mailu selhalo')
    } else {
      setInfo('Pokud jste změnili e‑mail, dorazí potvrzovací odkaz.')
    }
  }

  async function saveName() {
    setError('')
    setInfo('')
    setSavingName(true)
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } })
    setSavingName(false)
    if (error) {
      setError(error.message || 'Uložení jména selhalo')
    } else {
      setInfo('Jméno bylo uloženo')
    }
  }

  async function savePassword() {
    setError('')
    setInfo('')
    if (!pass1 || pass1 !== pass2) {
      setError('Hesla se neshodují')
      return
    }
    setSavingPass(true)
    const { error } = await supabase.auth.updateUser({ password: pass1 })
    setSavingPass(false)
    if (error) {
      setError(error.message || 'Změna hesla selhala')
    } else {
      setPass1('')
      setPass2('')
      setInfo('Heslo bylo změněno')
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: bg,
        color: text,
        padding: 24
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Účet</h1>
          <a href='/app' style={{ color: primary, textDecoration: 'none', fontWeight: 700 }}>
            Zpět do aplikace
          </a>
        </div>

        {error ? <div style={{ color: '#F87171', marginBottom: 12 }}>{error}</div> : null}
        {info ? <div style={{ color: primary, marginBottom: 12 }}>{info}</div> : null}

        <section
          style={{
            background: surface,
            borderRadius: 16,
            padding: 16,
            border: '1px solid #2A2A2A',
            marginBottom: 16
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Základní údaje</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>E‑mail</span>
              <input
                type='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  background: '#E5E7EB',
                  color: '#111827',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 14px'
                }}
              />
            </label>
            <button
              onClick={saveEmail}
              disabled={savingEmail || !email}
              style={{
                justifySelf: 'start',
                background: primary,
                color: text,
                border: 'none',
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 700,
                cursor: savingEmail || !email ? 'not-allowed' : 'pointer'
              }}
            >
              {savingEmail ? 'Ukládám…' : 'Uložit e‑mail'}
            </button>

            <label style={{ display: 'grid', gap: 6 }}>
              <span>Jméno</span>
              <input
                type='text'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Vaše jméno'
                style={{
                  background: '#E5E7EB',
                  color: '#111827',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 14px'
                }}
              />
            </label>
            <button
              onClick={saveName}
              disabled={savingName}
              style={{
                justifySelf: 'start',
                background: primary,
                color: text,
                border: 'none',
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 700,
                cursor: savingName ? 'not-allowed' : 'pointer'
              }}
            >
              {savingName ? 'Ukládám…' : 'Uložit jméno'}
            </button>
          </div>
        </section>

        <section
          style={{
            background: surface,
            borderRadius: 16,
            padding: 16,
            border: '1px solid #2A2A2A'
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Změna hesla</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Nové heslo</span>
              <input
                type='password'
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                style={{
                  background: '#E5E7EB',
                  color: '#111827',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 14px'
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Potvrzení hesla</span>
              <input
                type='password'
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                style={{
                  background: '#E5E7EB',
                  color: '#111827',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 14px'
                }}
              />
            </label>
            <button
              onClick={savePassword}
              disabled={savingPass || !pass1 || !pass2}
              style={{
                justifySelf: 'start',
                background: primary,
                color: text,
                border: 'none',
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 700,
                cursor: savingPass || !pass1 || !pass2 ? 'not-allowed' : 'pointer'
              }}
            >
              {savingPass ? 'Ukládám…' : 'Změnit heslo'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
