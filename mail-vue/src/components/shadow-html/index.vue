<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { loadObjectUrl } from '@/utils/object.js'
import { useUiStore } from '@/store/ui.js'

const uiStore = useUiStore()

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null
let renderVersion = 0

const blockedTags = new Set(['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base', 'style', 'svg', 'math'])
const allowedAttributes = new Set([
  'alt', 'align', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'class', 'colspan', 'height',
  'href', 'id', 'name', 'rel', 'rowspan', 'src', 'style', 'target', 'title', 'valign', 'width'
])

const themeCanvas = '#141414'
const themeText = '#E5EAF3'
const lightSurfaceText = '#303133'

function colorChannels(value) {
  const color = value.replace(/!important/gi, '').trim().toLowerCase()
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map(item => item + item).join('') : hex[1]
    return [0, 2, 4].map(index => Number.parseInt(digits.slice(index, index + 2), 16))
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/)
  if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) < 0.55) return null
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  }
  if (color === 'black') return [0, 0, 0]
  if (color === 'white') return [255, 255, 255]
  if (color === 'silver' || color === 'gray' || color === 'grey') return [192, 192, 192]
  return null
}

function luminance(channels) {
  const [red, green, blue] = channels.map(channel => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(text, background) {
  const lighter = Math.max(luminance(text), luminance(background))
  const darker = Math.min(luminance(text), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function styleValue(style, property) {
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'))
  return match ? match[1].trim() : ''
}

function opaqueColor(value) {
  if (!value) return null
  const token = value.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6})|rgba?\([^)]+\)|\b(?:white|black|silver|gray|grey)\b/i)
  return token ? colorChannels(token[0]) : null
}

function setTextColor(element, color) {
  const style = (element.getAttribute('style') || '').replace(/(^|;)\s*color\s*:[^;]*/gi, '$1')
  const separator = style && !style.trim().endsWith(';') ? ';' : ''
  element.setAttribute('style', `${style}${separator}color:${color}`)
}

function elementBackground(element, inheritedBackground) {
  const style = element.getAttribute('style') || ''
  return opaqueColor(styleValue(style, 'background-color'))
    || opaqueColor(styleValue(style, 'background'))
    || opaqueColor(element.getAttribute('bgcolor') || '')
    || inheritedBackground
}

function adaptContrast(element, inheritedText, inheritedBackground) {
  const background = elementBackground(element, inheritedBackground)
  const specified = opaqueColor(styleValue(element.getAttribute('style') || '', 'color'))
  let text = specified || inheritedText
  if (contrast(text, background) < 3) {
    const readable = luminance(background) > 0.6 ? lightSurfaceText : themeText
    text = colorChannels(readable)
    setTextColor(element, readable)
  }
  for (const child of [...element.children]) adaptContrast(child, text, background)
}

function sanitizeStyle(value) {
  return value
    .replace(/url\s*\(/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/-moz-binding\s*:/gi, '')
    .replace(/@import/gi, '')
    .replace(/[<>]/g, '')
}

function isSafeUrl(value) {
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('cid:') || normalized.startsWith('{{domain}}') || normalized.startsWith('attachments/') || normalized.startsWith('/attachments/')
}

function sanitizeEmailHtml(html) {
  const parser = new DOMParser()
  const document = parser.parseFromString(`<body>${html || ''}</body>`, 'text/html')
  const body = document.body
  const bodyStyle = sanitizeStyle(body.getAttribute('style') || '')

  for (const element of [...body.querySelectorAll('*')]) {
    const tagName = element.tagName.toLowerCase()
    if (blockedTags.has(tagName)) {
      element.remove()
      continue
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value
      if (name.startsWith('on') || name === 'srcdoc' || !allowedAttributes.has(name)) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (name === 'style') {
        element.setAttribute('style', sanitizeStyle(value))
      }
      if ((name === 'src' || name === 'href') && !isSafeUrl(value)) {
        element.removeAttribute(attribute.name)
      }
    }

    if (tagName === 'a' && element.hasAttribute('href')) {
      element.setAttribute('rel', 'noopener noreferrer')
      element.setAttribute('target', '_blank')
    }
  }

  const objectImages = [...body.querySelectorAll('img[src]')]
    .map((image) => image.getAttribute('src'))
    .filter((src) => src && (src.startsWith('{{domain}}') || src.startsWith('attachments/') || src.startsWith('/attachments/')))

  return { html: body.innerHTML, bodyStyle, objectImages }
}

async function updateContent() {
  if (!shadowRoot) return
  const currentVersion = ++renderVersion
  const sanitized = sanitizeEmailHtml(props.html)

  const textColor = uiStore.dark ? '#E5EAF3' : '#303133'
  const linkColor = uiStore.dark ? '#79BBFF' : '#0E70DF'
  shadowRoot.innerHTML = `
    <style>
      :host { all: initial; color-scheme: ${uiStore.dark ? 'dark' : 'light'}; width: 100%; height: 100%; font-family: Inter, 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: ${textColor}; word-break: break-word; }
      h1, h2, h3, h4 { font-size: 18px; font-weight: 700; }
      p { margin: 0; }
      a { text-decoration: none; color: ${linkColor}; }
      .shadow-content { background: transparent; color: ${textColor}; width: fit-content; height: fit-content; min-width: 100%; }
      img:not(table img) { max-width: 100%; height: auto !important; }
    </style>
    <div class="shadow-content"></div>
  `

  const content = shadowRoot.querySelector('.shadow-content')
  if (sanitized.bodyStyle) content.setAttribute('style', sanitized.bodyStyle)
  content.innerHTML = sanitized.html
  if (uiStore.dark) adaptContrast(content, colorChannels(themeText), colorChannels(themeCanvas))

  await Promise.all(sanitized.objectImages.map(async (src) => {
    const image = [...content.querySelectorAll('img[src]')].find((item) => item.getAttribute('src') === src)
    if (!image) return
    const key = src.replace(/^\{\{domain\}\}/, '').replace(/^\//, '')
    try {
      image.setAttribute('src', await loadObjectUrl(key))
    } catch {
      image.removeAttribute('src')
    }
  }))

  if (currentVersion === renderVersion) autoScale()
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return
  const shadowContent = shadowRoot.querySelector('.shadow-content')
  if (!shadowContent) return
  const childWidth = shadowContent.scrollWidth
  if (childWidth === 0) return
  shadowRoot.host.style.zoom = contentBox.value.offsetWidth / childWidth
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
})

watch(() => [props.html, uiStore.dark], updateContent)
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: Inter, "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
