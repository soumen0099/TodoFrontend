import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import toast from 'react-hot-toast'
import { isBefore, startOfDay, format, subDays, isSameDay } from 'date-fns'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import api from '../api'
import { disconnectSocket, getSocket } from '../socket'

const COLORS = ['#7c6ff7', '#ec4899', '#22c55e', '#f59e0b', '#38bdf8', '#f43f5e', '#a78bfa']
const CATEGORIES = ['work', 'personal', 'shopping']
const CATEGORY_LABELS = {
  work: 'Work',
  personal: 'Personal',
  shopping: 'Shopping'
}
const DASHBOARD_USER_CACHE_KEY = 'taskflow_cached_user'
const DASHBOARD_TODOS_CACHE_KEY = 'taskflow_cached_todos'

function readDashboardCache() {
  try {
    const cachedUserRaw = localStorage.getItem(DASHBOARD_USER_CACHE_KEY)
    const cachedTodosRaw = localStorage.getItem(DASHBOARD_TODOS_CACHE_KEY)
    const cachedUser = cachedUserRaw ? JSON.parse(cachedUserRaw) : null
    const cachedTodos = cachedTodosRaw ? JSON.parse(cachedTodosRaw) : []
    return {
      user: cachedUser,
      todos: Array.isArray(cachedTodos) ? cachedTodos : []
    }
  } catch {
    return { user: null, todos: [] }
  }
}

function writeDashboardCache(nextUser, nextTodos) {
  try {
    if (nextUser) {
      localStorage.setItem(DASHBOARD_USER_CACHE_KEY, JSON.stringify(nextUser))
    }
    if (Array.isArray(nextTodos)) {
      localStorage.setItem(DASHBOARD_TODOS_CACHE_KEY, JSON.stringify(nextTodos))
    }
  } catch {
    // No-op: local cache write failures should not block app usage
  }
}

function spawnConfetti(x, y) {
  for (let i = 0; i < 14; i++) {
    const el = document.createElement('div')
    el.className = 'confetti-piece'
    el.style.left = `${x + (Math.random() - 0.5) * 80}px`
    el.style.top = `${y}px`
    el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)]
    el.style.animationDelay = `${Math.random() * 0.3}s`
    el.style.transform = `rotate(${Math.random() * 360}deg)`
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1600)
  }
}

function SortableTodoItem({ todo, draggableEnabled, onToggle, onEdit, onDelete, checkRefs }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: todo._id, disabled: !draggableEnabled })

  const overdue = todo.dueDate && !todo.completed && isBefore(new Date(todo.dueDate), startOfDay(new Date()))
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`todo pri-${todo.priority || 'medium'} ${todo.completed ? 'done' : ''} ${overdue ? 'overdue' : ''} ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div
        className={`check ${todo.completed ? 'checked' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(todo._id, e)
        }}
        ref={el => checkRefs.current[todo._id] = el}
      >
        {todo.completed && '✓'}
      </div>

      <div className="todo-body">
        <p className="todo-title">{todo.title}</p>
        <div className="todo-meta">
          {todo.description && <span className="todo-desc">{todo.description}</span>}
          <span className={`badge ${todo.priority || 'medium'}`}>{todo.priority || 'medium'}</span>
          <span className={`badge category-badge cat-${todo.category || 'personal'}`}>
            {CATEGORY_LABELS[todo.category || 'personal']}
          </span>
          {todo.dueDate && (
            <span className={`badge ${overdue ? 'high' : ''}`} style={!overdue ? { background: 'var(--surface2)', color: 'var(--t2)', borderColor: 'var(--border)' } : {}}>
              📅 {format(new Date(todo.dueDate), 'MMM d, yyyy')}
            </span>
          )}
        </div>
      </div>

      <div className="todo-actions" onClick={(e) => e.stopPropagation()}>
        <button className="ico edt" onClick={() => onEdit(todo)} title="Edit">✏️</button>
        <button className="ico del" onClick={() => onDelete(todo._id)} title="Delete">🗑</button>
      </div>
    </div>
  )
}

export default function DashboardPage({ theme, toggleTheme }) {
  const [todos, setTodos] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [priority, setPriority] = useState('medium')
  const [category, setCategory] = useState('personal')
  const [dueDate, setDueDate] = useState(null)
  const [editTodo, setEditTodo] = useState(null)
  const [allDone, setAllDone] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine)
  const navigate = useNavigate()
  const checkRefs = useRef({})
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    const goOnline = () => setOfflineMode(false)
    const goOffline = () => setOfflineMode(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Fetch logged-in user + todos on mount
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    Promise.all([
      api.get('/auth/me'),
      api.get('/todos')
    ])
      .then(([meRes, todosRes]) => {
        const nextUser = meRes.data.user
        const nextTodos = Array.isArray(todosRes.data.todos) ? todosRes.data.todos : []
        setUser(nextUser)
        setTodos(nextTodos)
        writeDashboardCache(nextUser, nextTodos)
      })
      .catch(() => {
        const cached = readDashboardCache()
        if (cached.user || cached.todos.length > 0) {
          setUser(cached.user)
          setTodos(cached.todos)
          setOfflineMode(true)
          toast('Offline mode: showing cached tasks.', { icon: '📱' })
          return
        }
        localStorage.removeItem('token')
        navigate('/login')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const socket = getSocket(token)
    if (!socket) return

    const onTodosSync = (payload) => {
      if (Array.isArray(payload?.todos)) {
        setTodos(payload.todos)
      }
    }

    socket.on('todos:sync', onTodosSync)

    return () => {
      socket.off('todos:sync', onTodosSync)
    }
  }, [])

  useEffect(() => {
    if (user || todos.length > 0) {
      writeDashboardCache(user, todos)
    }
  }, [user, todos])

  // Stats
  const total = todos.length
  const completed = todos.filter(t => t.completed).length
  const pending = total - completed
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  const completionData = [
    { name: 'Completed', value: completed, color: '#22c55e' },
    { name: 'Pending', value: pending, color: '#f59e0b' }
  ]

  const weeklyProgressData = useMemo(() => {
    const today = startOfDay(new Date())
    const last7Days = Array.from({ length: 7 }, (_, idx) => subDays(today, 6 - idx))

    return last7Days.map((day) => {
      const dayTodos = todos.filter((todo) => {
        if (!todo.createdAt) return false
        const createdAt = new Date(todo.createdAt)
        if (Number.isNaN(createdAt.getTime())) return false
        return isSameDay(createdAt, day)
      })

      const dayCompleted = dayTodos.filter(todo => todo.completed).length
      const dayTotal = dayTodos.length

      return {
        day: format(day, 'EEE'),
        completed: dayCompleted,
        pending: Math.max(dayTotal - dayCompleted, 0),
        progress: dayTotal === 0 ? 0 : Math.round((dayCompleted / dayTotal) * 100)
      }
    })
  }, [todos])

  // Filtered + searched list
  const visible = todos.filter(t => {
    const matchFilter = filter === 'all' ? true : filter === 'done' ? t.completed : !t.completed
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })
  const canDragReorder = filter === 'all' && search.trim() === '' && !savingOrder

  // Add todo — POST /api/todos
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    setSubmitting(true)
    try {
      const { data } = await api.post('/todos', { title: newTitle.trim(), description: newDesc.trim(), priority, category, dueDate })
      if (data.newTodo) {
        setTodos(prev => [...prev, data.newTodo])
        setNewTitle(''); setNewDesc(''); setPriority('medium'); setCategory('personal'); setDueDate(null)
        setAllDone(false)
        toast.success('Todo added!')
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add task. Is backend running?'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Toggle complete — PUT /api/todos/:id
  const handleToggle = async (id, e) => {
    const current = todos.find(t => t._id === id)
    if (!current) return
    const newCompleted = !current.completed

    // Optimistic Update
    const updated = todos.map(t => t._id === id ? { ...current, completed: newCompleted } : t)
    setTodos(updated)

    if (newCompleted) {
      toast.success('Task completed!', { icon: '🎉' })
      const rect = (e?.currentTarget || e?.target)?.getBoundingClientRect()
      if (rect) spawnConfetti(rect.left + rect.width / 2, rect.top)
      const allNowDone = updated.every(t => t.completed)
      if (allNowDone && updated.length > 0) setAllDone(true)
    } else {
      toast.success('Task reopened')
      setAllDone(false)
    }

    try {
      const { data } = await api.put(`/todos/${id}`, {
        title: current.title,
        description: current.description,
        completed: newCompleted,
        priority: current.priority,
        category: current.category || 'personal',
        dueDate: current.dueDate,
        order: current.order
      })
      setTodos(prev => prev.map(t => t._id === id ? { ...t, ...data.todo } : t))
    } catch (err) {
      setTodos(todos)
      toast.error('Failed to update task. Reverting...')
    }
  }

  // Delete — DELETE /api/todos/:id
  const handleDelete = async (id) => {
    try {
      await api.delete(`/todos/${id}`)
      const updated = todos.filter(t => t._id !== id)
      setTodos(updated)
      toast.success('Deleted!')
      setAllDone(updated.length > 0 && updated.every(t => t.completed))
    } catch (err) {
      toast.error('Failed to delete task.')
    }
  }

  // Save edit — PUT /api/todos/:id
  const handleEditSave = async () => {
    if (!editTodo.title.trim()) return
    try {
      const { data } = await api.put(`/todos/${editTodo._id}`, {
        title: editTodo.title,
        description: editTodo.description,
        completed: editTodo.completed,
        priority: editTodo.priority,
        category: editTodo.category,
        dueDate: editTodo.dueDate,
        order: editTodo.order
      })
      setTodos(todos.map(t => t._id === editTodo._id ? { ...t, ...data.todo, priority: editTodo.priority, category: editTodo.category, dueDate: editTodo.dueDate, order: editTodo.order } : t))
      toast.success('Saved!')
      setEditTodo(null)
    } catch (err) {
      toast.error('Failed to save changes.')
    }
  }

  // Logout
  const handleLogout = () => {
    disconnectSocket()
    localStorage.removeItem('token')
    navigate('/login')
  }

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id || !canDragReorder) return

    const oldIndex = todos.findIndex(t => t._id === active.id)
    const newIndex = todos.findIndex(t => t._id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const previousTodos = todos
    const reorderedTodos = arrayMove(todos, oldIndex, newIndex).map((todo, index) => ({ ...todo, order: index }))

    setTodos(reorderedTodos)
    setSavingOrder(true)

    try {
      const payload = {
        items: reorderedTodos.map(todo => ({
          id: todo._id,
          order: todo.order
        }))
      }
      const { data } = await api.patch('/todos/reorder', payload)
      if (Array.isArray(data.todos)) {
        setTodos(data.todos)
      }
    } catch (err) {
      setTodos(previousTodos)
      toast.error('Failed to save new task order.')
    } finally {
      setSavingOrder(false)
    }
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

      {/* Navbar */}
      <nav className="nav">
        <div className="nav-left">
          <div className="nav-logo-icon">✦</div>
          <span className="nav-name">TaskFlow</span>
        </div>
        <div className="nav-right">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-yellow-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition duration-300 flex items-center justify-center"
            title="Toggle Dark Mode"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <span className="nav-username">Hey, {username} 👋</span>
          <div className="nav-avatar">{username[0]}</div>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="main">

        {offlineMode && (
          <div className="offline-banner">
            Offline mode active. You can view cached tasks. Changes will sync when internet is back.
          </div>
        )}

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
          <h1 className="greeting-title" style={{ color: theme === 'dark' ? '#f1f5f9' : '#0f172a', transition: 'color 0.3s' }}>
            Good work, <span style={{ color: theme === 'dark' ? '#818cf8' : '#6366f1', transition: 'color 0.3s' }}>{username}</span>!
          </h1>
          <p className="greeting-sub" style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', transition: 'color 0.3s' }}>
            Here's what's on your plate today.
          </p>

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

        <div className="charts-grid">
          <div className="chart-card">
            <p className="add-card-title">Completed vs Pending</p>
            {total === 0 ? (
              <p className="chart-empty">No tasks yet. Add tasks to see the chart.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={completionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={45}
                    paddingAngle={3}
                  >
                    {completionData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--t1)'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="chart-card">
            <p className="add-card-title">Weekly Progress</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weeklyProgressData} barCategoryGap={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill: 'var(--t2)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis tick={{ fill: 'var(--t2)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(value, name) => [`${value}`, name === 'completed' ? 'Completed' : 'Pending']}
                  labelFormatter={(label) => `${label}`}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--t1)'
                  }}
                />
                <Legend formatter={(value) => (value === 'completed' ? 'Completed' : 'Pending')} />
                <Bar dataKey="completed" stackId="a" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
              {['high', 'medium', 'low'].map(p => (
                <button
                  key={p} type="button"
                  className={`p-btn ${p} ${priority === p ? 'active' : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'} {p}
                </button>
              ))}
            </div>
            <div className="priority-row">
              <label>Category:</label>
              {CATEGORIES.map(c => (
                <button
                  key={c} type="button"
                  className={`cat-btn ${c} ${category === c ? 'active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <div className="add-row !mt-3">
              <DatePicker
                selected={dueDate}
                onChange={(date) => setDueDate(date)}
                placeholderText="Set due date (optional)"
                className="input !py-2 !w-full"
                dateFormat="MMM d, yyyy"
                isClearable
                wrapperClassName="!w-full"
              />
            </div>
          </form>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="filter-tabs">
            {[['all', 'All'], ['active', 'Active'], ['done', 'Done']].map(([val, label]) => (
              <button key={val} className={`f-tab ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>
                {label}
              </button>
            ))}
          </div>
          <span className="task-count">
            {visible.length} tasks {savingOrder ? '• saving order...' : canDragReorder ? '• drag to reorder' : '• clear filter/search to reorder'}
          </span>
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visible.map(todo => todo._id)} strategy={verticalListSortingStrategy}>
                {visible.map(todo => (
                  <SortableTodoItem
                    key={todo._id}
                    todo={todo}
                    draggableEnabled={canDragReorder}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEdit={(selectedTodo) => setEditTodo({ ...selectedTodo, category: selectedTodo.category || 'personal' })}
                    checkRefs={checkRefs}
                  />
                ))}
              </SortableContext>
            </DndContext>
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
              {['high', 'medium', 'low'].map(p => (
                <button
                  key={p} type="button"
                  className={`p-btn ${p} ${editTodo.priority === p ? 'active' : ''}`}
                  onClick={() => setEditTodo({ ...editTodo, priority: p })}
                >
                  {p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'} {p}
                </button>
              ))}
            </div>
            <div className="priority-row">
              <label>Category:</label>
              {CATEGORIES.map(c => (
                <button
                  key={c} type="button"
                  className={`cat-btn ${c} ${editTodo.category === c ? 'active' : ''}`}
                  onClick={() => setEditTodo({ ...editTodo, category: c })}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <div className="input-wrap">
              <label className="input-label">Due Date</label>
              <DatePicker
                selected={editTodo.dueDate ? new Date(editTodo.dueDate) : null}
                onChange={(date) => setEditTodo({ ...editTodo, dueDate: date })}
                placeholderText="No due date"
                className="input !w-full"
                dateFormat="MMM d, yyyy"
                isClearable
                wrapperClassName="!w-full"
              />
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
