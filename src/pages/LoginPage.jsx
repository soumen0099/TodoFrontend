import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const { data } = await api.post('/auth/login', form)
      localStorage.setItem('token', data.token)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="logo">
          <div className="logo-icon">✦</div>
          <span className="logo-name">TaskFlow</span>
        </div>

        <h1 className="auth-title">Welcome back 👋</h1>
        <p className="auth-sub">Login to manage your tasks</p>

        <form onSubmit={handleSubmit}>
          <div className="input-wrap">
            <label className="input-label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div className="input-wrap">
            <label className="input-label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          {error && <p style={{ color: '#f43f5e', marginBottom: '8px', fontSize: '14px' }}>{error}</p>}
          <button className="btn" type="submit">Login →</button>
        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  )
}
