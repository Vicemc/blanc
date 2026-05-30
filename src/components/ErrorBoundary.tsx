import React from 'react'

interface Props { children: React.ReactNode }
interface State { error: Error | null }

// Fronteira de erro global: captura exceções de render em runtime e mostra
// uma tela de recuperação em vez de uma página em branco.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
        background: 'var(--paper)', textAlign: 'center',
      }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32,
          textTransform: 'uppercase', letterSpacing: '-0.02em', margin: 0 }}>
          Algo quebrou
        </h1>
        <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
          fontSize: 18, color: 'var(--ink-soft)', maxWidth: 460, margin: 0 }}>
          ~ um erro inesperado interrompeu a cena ~
        </p>
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)',
          maxWidth: 560, overflowX: 'auto', background: 'var(--paper-deep)',
          border: '1px solid var(--line-soft)', borderRadius: 8, padding: '10px 14px',
          textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {this.state.error.message}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={this.handleReload} style={{
            padding: '10px 22px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
            fontFamily: 'var(--font-display)', fontSize: 13, textTransform: 'uppercase',
            letterSpacing: '0.06em' }}>
            Recarregar
          </button>
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
          color: 'var(--ink-mute)' }}>
          Seus dados locais foram preservados.
        </p>
      </div>
    )
  }
}
