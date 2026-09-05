const params = new URLSearchParams(location.search)
export const isMaxPlaytest = params.get('max') === '1' || params.has('WebAppStartParam') || location.hash.includes('WebAppData=')

export function installMaxPlaytest() {
  if (!isMaxPlaytest) return
  document.body.classList.add('max-playtest')
  const toolbar = document.createElement('nav')
  toolbar.id = 'maxToolbar'
  toolbar.setAttribute('aria-label', 'Управление тестом')
  for (const [text, action] of [
    ['Заново', () => document.querySelector('#resetButton').click()],
    ['Настройки', event => { const visible = document.body.classList.toggle('show-lab'); event.currentTarget.setAttribute('aria-expanded', String(visible)) }],
    ['Данные', event => { const visible = document.body.classList.toggle('show-debug'); event.currentTarget.setAttribute('aria-expanded', String(visible)) }],
    ['Экспорт', () => document.querySelector('#exportButton').click()],
  ]) {
    const button = document.createElement('button')
    button.type = 'button'; button.textContent = text
    if (text === 'Настройки' || text === 'Данные') button.setAttribute('aria-expanded', 'false')
    button.addEventListener('click', action); toolbar.append(button)
  }
  document.body.append(toolbar)
  const hint = document.createElement('div')
  hint.id = 'maxHint'; hint.textContent = 'Стрелки — наклон. JUMP — прыжок. Режимы и оценки — в настройках.'
  toolbar.after(hint)
  const bridge = document.createElement('script')
  bridge.src = 'https://st.max.ru/js/max-web-app.js'
  bridge.async = true
  bridge.onload = () => { toolbar.dataset.platform = window.WebApp?.platform ?? 'browser' }
  bridge.onerror = () => { toolbar.dataset.platform = 'bridge-unavailable' }
  document.head.append(bridge)
}

export function showMaxExport(payload) {
  if (!isMaxPlaytest) return false
  document.querySelector('#maxExportDialog')?.remove()
  const dialog = document.createElement('dialog')
  dialog.id = 'maxExportDialog'
  const title = document.createElement('strong'); title.textContent = 'Запись теста'
  const hint = document.createElement('p'); hint.textContent = 'Скопируйте JSON и сохраните в файл для воспроизведения. Запись остаётся на этом устройстве.'
  const textarea = document.createElement('textarea')
  textarea.readOnly = true; textarea.value = JSON.stringify(payload); textarea.setAttribute('aria-label', 'JSON записи теста')
  const copy = document.createElement('button'); copy.textContent = 'Копировать JSON'
  const status = document.createElement('output'); status.setAttribute('aria-live', 'polite')
  copy.addEventListener('click', async () => {
    textarea.select()
    try { await navigator.clipboard.writeText(textarea.value); status.textContent = 'Скопировано' }
    catch { status.textContent = 'Текст выделен — выберите «Копировать» в меню устройства.' }
  })
  const close = document.createElement('button'); close.textContent = 'Закрыть'; close.addEventListener('click', () => dialog.close())
  dialog.append(title, hint, textarea, copy, close, status); document.body.append(dialog); dialog.showModal()
  return true
}
