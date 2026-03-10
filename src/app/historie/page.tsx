'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

type Asset = {
  id: string
  kind: 'input' | 'output'
  storage_path: string
  mime: string
  url?: string
}

type Item = {
  id: string
  created_at: string
  type: string
  status: string
  provider: string
  cost: number
  assets: Asset[]
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
      const token = data.session?.access_token
      if (!token) {
        router.push('/login')
        return
      }

      try {
        const res = await fetch('/api/history', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (!res.ok) throw new Error('Failed to load history')
        
        const json = await res.json()
        if (!canceled) {
          setItems(json.jobs || [])
          setLoading(false)
        }
      } catch (e) {
        console.error(e)
        if (!canceled) setLoading(false)
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
        </div>
        {loading ? (
          <div>Načítání…</div>
        ) : items.length === 0 ? (
          <div style={{ opacity: 0.8 }}>Zatím zde nic není.</div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {items.map((it) => {
              const output = it.assets?.find(a => a.kind === 'output')
              return (
                <div
                  key={it.id}
                  style={{
                    background: surface,
                    borderRadius: 16,
                    border: '1px solid #2A2A2A',
                    padding: 20,
                    display: 'grid',
                    gap: 16,
                    gridTemplateColumns: output ? '200px 1fr' : '1fr'
                  }}
                >
                  {output && output.url ? (
                    <div style={{ 
                      width: 200, 
                      height: 200, 
                      borderRadius: 12, 
                      overflow: 'hidden', 
                      background: '#000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {output.mime.startsWith('video') ? (
                         <video 
                           src={output.url} 
                           controls 
                           style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                         />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img 
                          src={output.url} 
                          alt="Výsledek" 
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      )}
                    </div>
                  ) : output ? (
                    <div style={{ width: 200, height: 200, borderRadius: 12, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                      Bez náhledu
                    </div>
                  ) : null}
                  
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
                                {it.type === 'image' ? 'Obrázek z textu' : 
                                 it.type === 'video' ? 'Video' : 
                                 it.type === 'faceswap' ? 'Výměna tváří' : it.type}
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.6, fontFamily: 'monospace' }}>
                                {it.id}
                            </div>
                        </div>
                        <div style={{ 
                            padding: '4px 10px', 
                            borderRadius: 999, 
                            fontSize: 12, 
                            fontWeight: 700,
                            background: it.status === 'succeeded' ? 'rgba(16, 185, 129, 0.2)' : it.status === 'failed' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                            color: it.status === 'succeeded' ? '#34D399' : it.status === 'failed' ? '#F87171' : '#FBBF24',
                        }}>
                            {it.status === 'succeeded' ? 'Hotovo' : 
                             it.status === 'failed' ? 'Chyba' : 
                             it.status === 'running' ? 'Generuje se' : 'Ve frontě'}
                        </div>
                    </div>
                    
                    <div style={{ fontSize: 14, color: '#9CA3AF', marginBottom: 8 }}>
                        {new Date(it.created_at).toLocaleString('cs-CZ')}
                    </div>
                    
                    {it.cost > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                            <span>{it.cost}</span>
                            <img src="/coin.png" alt="Kredity" style={{ width: 14, height: 14 }} />
                        </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
