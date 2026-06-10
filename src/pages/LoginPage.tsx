// src/pages/LoginPage.tsx
import { useState } from 'react'
import { signIn } from '../lib/auth'

interface Props {
  onSuccess: () => void
  onCancel?: () => void
}

export default function LoginPage({ onSuccess, onCancel }: Props) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError(null)

    const { error } = await signIn(email.trim(), password)
    setLoading(false)

    if (error) {
      const msg =
        error.toLowerCase().includes('invalid login credentials')
          ? 'Email ou senha incorretos.'
          : error.toLowerCase().includes('email not confirmed')
          ? 'Email ainda não confirmado. Verifique sua caixa de entrada e clique no link enviado pelo Supabase.'
          : error.toLowerCase().includes('failed to fetch') || error.toLowerCase().includes('networkerror')
          ? 'Erro de conexão. Verifique sua internet ou as configurações do Supabase.'
          : error
      setError(msg)
      return
    }

    onSuccess()
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24,
      background: 'var(--paper)',
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--paper-deep)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '40px 36px',
        boxShadow: 'var(--shadow)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28, textTransform: 'uppercase',
            letterSpacing: '-0.02em', margin: '0 0 6px',
          }}>
            Digimon Survive
          </h1>
          <p style={{
            fontFamily: 'var(--font-serif)', fontStyle: 'italic',
            fontSize: 16, color: 'var(--ink-soft)', margin: 0,
          }}>
            ~ A Midnight Summer's Dream ~
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--ink-mute)', marginBottom: 6,
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              style={{
                width: '100%', border: '1px solid var(--line)',
                borderRadius: 8, padding: '10px 14px',
                fontFamily: 'var(--font-body)', fontSize: 15,
                background: 'var(--paper)', color: 'var(--ink)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--ink-mute)', marginBottom: 6,
            }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: '100%', border: '1px solid var(--line)',
                borderRadius: 8, padding: '10px 14px',
                fontFamily: 'var(--font-body)', fontSize: 15,
                background: 'var(--paper)', color: 'var(--ink)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(196,51,33,0.08)',
              border: '1px solid var(--coral)',
              borderRadius: 8,
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--coral)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: '100%', padding: '12px 0',
              borderRadius: 999, border: '1px solid var(--ink)',
              background: loading ? 'var(--paper-deep)' : 'var(--ink)',
              color: loading ? 'var(--ink-mute)' : 'var(--paper)',
              fontFamily: 'var(--font-display)', fontSize: 14,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {/* Nota de rodapé */}
        <p style={{
          marginTop: 24, textAlign: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.08em', color: 'var(--ink-mute)',
        }}>
          Conta criada pelo GM · Não há cadastro público
        </p>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              display: 'block', margin: '12px auto 0',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.08em', color: 'var(--ink-soft)',
              textDecoration: 'underline',
            }}
          >
            ← Continuar como visitante
          </button>
        )}
      </div>
    </div>
  )
}
