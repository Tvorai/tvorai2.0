'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

type Item = {
  id: string
  created_at: string
  type: string
  status: string
}

export default function HistoriePage() {
  const router = useRouter()

  const primary = '#00C8D7'
  const bg = '#0A0A0A'
  const surface = '#1A1A1A'
  const text = '#FFFFFF'

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let canceled = false
    async function load() {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        router.push('/login')
        return
      }
      const { data: rows } = await supabase
        .from('generation_jobs')
        .select('id, created_at, type, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!canceled) {
        setItems((rows as Item[]) || [])
        setLoading(false)
      }
    }
    load()
    return () => {
      canceled = true
    }
  }, [router])

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: bg,
        color: text,
        padding: 24
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Historie</h1>
          <a href="/" style={{ color: primary, textDecoration: 'none', fontWeight: 700 }}>
            Zpět
          </a>
        </div>
        {loading ? (
          <div>Načítání…</div>
        ) : items.length === 0 ? (
          <div style={{ opacity: 0.8 }}>Zatím zde nic není.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  background: surface,
                  borderRadius: 12,
                  border: '1px solid #2A2A2A',
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 700 }}>{it.type}</div>
                  <div style={{ opacity: 0.8, fontSize: 13 }}>{new Date(it.created_at).toLocaleString()}</div>
                </div>
                <div style={{ fontWeight: 700, color: it.status === 'succeeded' ? '#10B981' : it.status === 'failed' ? '#EF4444' : '#EAB308' }}>
                  {it.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
