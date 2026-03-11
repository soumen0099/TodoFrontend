import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const COLORS = ['#7c6ff7','#ec4899','#22c55e','#f59e0b','#38bdf8','#f43f5e','#a78bfa']

function spawnConfetti(x, y) {
  for (let i = 0; i < 14; i++) {
    const el = document.createElement('div')
    el.className = 'confetti-piece'
    el.style.left = `${x + (Math.random() - 0.5) * 80}px`
    el.style.top  = `${y}px`
    el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)]
    el.style.animationDelay = `${Math.random() * 0.3}s`
    el.style.transform = `rotate(${Math.random() * 360}deg)`
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1600)
  }
}

export default function DashboardPage() {
  const [todos, setTodos]       = useState([])
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc]   = useState('')
  const [priority, setPriority] = useState('medium')
  const [editTodo, setEditTodo] = useState(null)
  const [allDone, setAllDone]   = useState(false)
  const [user, setUser]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast]       = useState('')
  const navigate = useNavigate()
  const checkRefs = useRef({})

  // Fetch logged-in user + todos on mount
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    Promise.all([
      api.get('/auth/me'),
      api.get('/todos')
    ])
      .then(([meRes, todosRes]) => {
        setUser(meRes.data.user)
        setTodos(Array.isArray(todosRes.data.todos) ? todosRes.data.todos : [])
      })
      .catch(() => {
        localStorage.removeItem('token')
        navigate('/login')
      })
      .finally(() => setLoading(false))
  }, [])

  // Stats
  const total     = todos.length
  const completed = todos.filter(t => t.completed).length
  const pending   = total - completed
  const pct       = total === 0 ? 0 : Math.round((completed / total) * 100)

  // Filtered + searched list
  const visible = todos.filter(t => {
    const matchFilter = filter === 'all' ? true : filter === 'done' ? t.completed : !t.completed
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  // Add todo — POST /api/todos
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    setSubmitting(true)
    try {
      const { data } = await api.post('/todos', { title: newTitle.trim(), description: newDesc.trim(), priority })
      if (data.newTodo) {
        setTodos(prev => [data.newTodo, ...prev])
        setNewTitle(''); setNewDesc(''); setPriority('medium')
        setAllDone(false)
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add task. Is backend running?'
      setToast(msg)
      setTimeout(() => setToast(''), 3000)
    } finally {
      setSubmitting(false)
    }
  }

  // Toggle complete — PUT /api/todos/:id
  const handleToggle = async (id, e) => {
    const current = todos.find(t => t._id === id)
    if (!current) return
    const newCompleted = !current.completed
    try {
      const { data } = await api.put(`/todos/${id}`, { title: current.title, description: current.description, completed: newCompleted })
      const updated = todos.map(t => t._id === id ? { ...current, ...data.todo } : t)
      setTodos(updated)
      if (newCompleted) {
        const rect = (e?.currentTarget || e?.target)?.getBoundingClientRect()
        if (rect) spawnConfetti(rect.left + rect.width / 2, rect.top)
        const allNowDone = updated.every(t => t.completed)
        if (allNowDone && updated.length > 0) setAllDone(true)
      } else {
        setAllDone(false)
      }
    } catch (err) {
      setToast('Failed to update task.')
      setTimeout(() => setToast(''), 3000)
    }
  }

  // Delete — DELETE /api/todos/:id
  const handleDelete = async (id) => {
    try {
      await api.delete(`/todos/${id}`)
      const updated = todos.filter(t => t._id !== id)
      setTodos(updated)
      setAllDone(updated.length > 0 && updated.every(t => t.completed))
    } catch (err) {
      setToast('Failed to delete task.')
      setTimeout(() => setToast(''), 3000)
    }
  }

  // Save edit — PUT /api/todos/:id
  const handleEditSave = async () => {
    if (!editTodo.title.trim()) return
    try {
      const { data } = await api.put(`/todos/${editTodo._id}`, {
        title: editTodo.title,
        description: editTodo.description,
        completed: editTodo.completed
      })
      setTodos(todos.map(t => t._id === editTodo._id ? { ...t, ...data.todo, priority: editTodo.priority } : t))
      setEditTodo(null)
    } catch (err) {
      setToast('Failed to save changes.')
      setTimeout(() => setToast(''), 3000)
    }
  }

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const username = user?.username || '...'

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07080f' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '4px solid rgba(124,111,247,0.2)', borderTop: '4px solid #7c6ff7', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Loading your tasks...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )

  return (
    <div className="app">

      {/* Error Toast */}
      {toast && (
        <div style={{ position:'fixed', top:20, right:20, background:'#f43f5e', color:'#fff', padding:'12px 20px', borderRadius:12, zIndex:9999, fontWeight:600, fontSize:14, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
          ⚠️ {toast}
        </div>
      )}

      {/* Navbar */}
      <nav className="nav">
        <div className="nav-left">
          <div className="nav-logo-icon">✦</div>
          <span className="nav-name">TaskFlow</span>
        </div>
        <div className="nav-right">
          <span className="nav-username">Hey, {username} 👋</span>
          <div className="nav-avatar">{username[0]}</div>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="main">

        {/* All-done celebration banner */}
        {allDone && (
          <div className="banner">
            <span className="banner-emoji">🎉</span>
            <div>
              <div className="banner-text">All tasks completed!</div>
              <div className="banner-sub">You're absolutely crushing it today.</div>
            </div>
          </div>
        )}

        {/* Greeting */}
        <div className="greeting">
          <h1 className="greeting-title">
            Good work, <span>{username}</span>!
          </h1>
          <p className="greeting-sub">Here's what's on your plate today.</p>

          {/* Progress bar */}
          <div className="progress-wrap">
            <div className="progress-header">
              <span className="progress-label">Overall Progress</span>
              <span className="progress-pct">{pct}%</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-steps">
              {todos.map(t => (
                <span key={t._id} className={`progress-step ${t.completed ? 'done' : ''}`}>
                  {t.completed ? '✓' : '○'} {t.title.slice(0, 16)}{t.title.length > 16 ? '…' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat s-total">
            <div className="stat-icon">📋</div>
            <div className="stat-num">{total}</div>
            <div className="stat-tag">Total</div>
          </div>
          <div className="stat s-done">
            <div className="stat-icon">✅</div>
            <div className="stat-num">{completed}</div>
            <div className="stat-tag">Done</div>
          </div>
          <div className="stat s-left">
            <div className="stat-icon">⏳</div>
            <div className="stat-num">{pending}</div>
            <div className="stat-tag">Pending</div>
          </div>
        </div>

        {/* Add Todo */}
        <div className="add-card">
          <p className="add-card-title">✦ New Task</p>
          <form onSubmit={handleAdd}>
            <div className="add-row">
              <input
                className="input"
                type="text"
                placeholder="What needs to be done?"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
              />
              <button className="btn-add" type="submit" title="Add task" disabled={submitting}>
                {submitting ? '…' : '+'}
              </button>
            </div>
            <input
              className="input"
              type="text"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
            <div className="priority-row">
              <label>Priority:</label>
              {['high','medium','low'].map(p => (
                <button
                  key={p} type="button"
                  className={`p-btn ${p} ${priority === p ? 'active' : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'} {p}
                </button>
              ))}
            </div>
          </form>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="filter-tabs">
            {[['all','All'],['active','Active'],['done','Done']].map(([val, label]) => (
              <button key={val} className={`f-tab ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>
                {label}
              </button>
            ))}
          </div>
          <span className="task-count">{visible.length} tasks</span>
        </div>

        {/* Search */}
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Todo List */}
        <div className="todo-list">
          {visible.length === 0 ? (
            <div className="empty">
              <span className="empty-emoji">{search ? '🔍' : filter === 'done' ? '🎯' : '📋'}</span>
              <p className="empty-title">{search ? 'No results found' : filter === 'done' ? 'Nothing completed yet' : 'No tasks here'}</p>
              <p className="empty-sub">{search ? `No tasks match "${search}"` : 'Add a task above to get started!'}</p>
            </div>
          ) : (
            visible.map(todo => (
              <div key={todo._id} className={`todo pri-${todo.priority || 'medium'} ${todo.completed ? 'done' : ''}`}>
                <div
                  className={`check ${todo.completed ? 'checked' : ''}`}
                  onClick={(e) => handleToggle(todo._id, e)}
                  ref={el => checkRefs.current[todo._id] = el}
                >
                  {todo.completed && '✓'}
                </div>

                <div className="todo-body">
                  <p className="todo-title">{todo.title}</p>
                  <div className="todo-meta">
                    {todo.description && <span className="todo-desc">{todo.description}</span>}
                    <span className={`badge ${todo.priority || 'medium'}`}>{todo.priority || 'medium'}</span>
                  </div>
                </div>

                <div className="todo-actions">
                  <button className="ico edt" onClick={() => setEditTodo({ ...todo })} title="Edit">✏️</button>
                  <button className="ico del" onClick={() => handleDelete(todo._id)} title="Delete">🗑</button>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* Edit Modal */}
      {editTodo && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditTodo(null)}>
          <div className="modal">
            <p className="modal-title">✏️ Edit Task</p>
            <div className="input-wrap">
              <label className="input-label">Title</label>
              <input
                className="input"
                value={editTodo.title}
                onChange={e => setEditTodo({ ...editTodo, title: e.target.value })}
              />
            </div>
            <div className="input-wrap">
              <label className="input-label">Description</label>
              <input
                className="input"
                value={editTodo.description}
                onChange={e => setEditTodo({ ...editTodo, description: e.target.value })}
              />
            </div>
            <div className="priority-row">
              <label>Priority:</label>
              {['high','medium','low'].map(p => (
                <button
                  key={p} type="button"
                  className={`p-btn ${p} ${editTodo.priority === p ? 'active' : ''}`}
                  onClick={() => setEditTodo({ ...editTodo, priority: p })}
                >
                  {p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'} {p}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setEditTodo(null)}>Cancel</button>
              <button className="btn-save" onClick={handleEditSave}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
