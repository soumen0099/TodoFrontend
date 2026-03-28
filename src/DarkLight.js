const savedTheme = localStorage.getItem('theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const isDark = savedTheme ? savedTheme === 'dark' : prefersDark
document.documentElement.classList.toggle('dark', isDark)