import { ElNotification } from 'element-plus'

const notifiedIds = new Set()
let permissionRequested = false

function uniqueNewEmails(emails = []) {
  return emails.filter(item => {
    if (!item?.emailId || notifiedIds.has(item.emailId)) return false
    notifiedIds.add(item.emailId)
    return true
  })
}

function latestByThread(emails) {
  const threads = new Map()
  for (const item of emails) {
    const key = item.threadId || `email-${item.emailId}`
    const current = threads.get(key)
    if (!current || Number(item.emailId) > Number(current.emailId)) {
      threads.set(key, item)
    }
  }
  return [...threads.values()]
}

export function notifyNewMail({ emails, t, onOpen, currentThreadId }) {
  const fresh = uniqueNewEmails(emails)
  if (!fresh.length) return

  const threadEmails = latestByThread(fresh)
  const visible = threadEmails.filter(item => item.threadId !== currentThreadId)
  if (!visible.length) return

  const latest = visible.at(-1)
  const count = fresh.length
  const title = t('newMailNotification')
  const message = count > 1
    ? t('newMailNotificationCount', { count })
    : `${latest.name || latest.sendEmail || ''}${latest.subject ? ` · ${latest.subject}` : ''}`

  ElNotification({
    title,
    message,
    type: 'info',
    duration: 6500,
    onClick: () => onOpen(latest)
  })

  if (!('Notification' in window)) return
  if (Notification.permission === 'default' && !permissionRequested) {
    permissionRequested = true
    Notification.requestPermission().catch(() => {})
    return
  }
  if (document.visibilityState === 'visible' || Notification.permission !== 'granted') return

  const browserNotice = new Notification(title, {
    body: message,
    tag: `cloud-mail-${latest.threadId || latest.emailId}`
  })
  browserNotice.onclick = () => {
    window.focus()
    onOpen(latest)
    browserNotice.close()
  }
}

export function requestMailNotificationPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return
  Notification.requestPermission().catch(() => {})
}
