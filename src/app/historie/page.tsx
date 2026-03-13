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
  prompt?: string
  assets: Asset[]
  url?: string
}

export default function HistoriePage() {
  const router = useRouter()

  const primary = '#00C8D7'
  const bg = '#0A0A0A'
  const surface = '#1A1A1A'
  const text = '#FFFFFF'

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  const handleDownload = (url: string) => {
    window.open(url, '_blank')
  }

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
      <style>{`
        .history-card {
          background: ${surface};
          border-radius: 16px;
          border: 1px solid #2A2A2A;
          padding: 20px;
          display: grid;
          gap: 16px;
        }
        .history-card.has-preview {
          grid-template-columns: 200px 1fr;
        }
        .history-preview {
          width: 200px;
          height: 200px;
          border-radius: 12px;
          overflow: hidden;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .history-preview.empty {
          background: #111;
          color: #666;
        }
        .history-content {
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }
        .history-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }
        .history-title {
          font-weight: 800;
          font-size: 18px;
          margin-bottom: 4px;
        }
        .history-prompt {
          font-size: 14px;
          color: #FFFFFF;
          margin-bottom: 4px;
          opacity: 0.9;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .history-id {
          font-size: 12px;
          opacity: 0.4;
          font-family: monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .history-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
        }
        .history-download {
          background: ${primary};
          color: #FFFFFF;
          border: none;
          border-radius: 12px;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        .history-date {
          font-size: 14px;
          color: #9CA3AF;
          margin-bottom: 8px;
        }
        @media (max-width: 700px) {
          .history-card,
          .history-card.has-preview {
            grid-template-columns: 1fr;
            padding: 16px;
          }
          .history-preview {
            width: 100%;
            height: auto;
            aspect-ratio: 1 / 1;
          }
          .history-top {
            flex-direction: column;
            align-items: stretch;
          }
          .history-actions {
            justify-content: space-between;
          }
          .history-download {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
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
              // const output = it.assets?.find(a => a.kind === 'output')
              const outputUrl = it.url
              return (
                <div
                  key={it.id}
                  className={`history-card${outputUrl ? ' has-preview' : ''}`}
                >
                  {outputUrl ? (
                    <div className="history-preview">
                      {it.type === 'video' ? (
                         <video 
                           src={outputUrl} 
                           controls 
                           style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                         />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img 
                          src={outputUrl} 
                          alt="Výsledek" 
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="history-preview empty">
                      Bez náhledu
                    </div>
                  )}
                  
                  <div className="history-content">
                    <div className="history-top">
                        <div style={{ minWidth: 0 }}>
                            <div className="history-title">
                                {it.type === 'image' ? 'Obrázek z textu' : 
                                 it.type === 'video' ? 'Video' : 
                                 it.type === 'faceswap' ? 'Výměna tváří' : it.type}
                            </div>
                            <div className="history-prompt">
                                {it.prompt || 'Bez popisu'}
                            </div>
                            <div className="history-id">
                                {it.id}
                            </div>
                        </div>
                        <div className="history-actions">
                            {it.status === 'succeeded' && it.url && (
                                <button
                                    onClick={() => handleDownload(it.url!)}
                                    className="history-download"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    Stáhnout
                                </button>
                            )}
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
                    </div>
                    
                    <div className="history-date">
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
