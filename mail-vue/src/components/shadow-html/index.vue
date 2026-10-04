<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { loadObjectUrl } from '@/utils/object.js'

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
  'alt', 'align', 'border', 'cellpadding', 'cellspacing', 'class', 'colspan', 'height',
  'href', 'id', 'name', 'rel', 'rowspan', 'src', 'style', 'target', 'title', 'valign', 'width'
])

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

  shadowRoot.innerHTML = `
    <style>
      :host { all: initial; width: 100%; height: 100%; font-family: Inter, 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: var(--el-text-color-primary); word-break: break-word; }
      h1, h2, h3, h4 { font-size: 18px; font-weight: 700; }
      p { margin: 0; }
      a { text-decoration: none; color: var(--el-color-primary); }
      .shadow-content { background: transparent; width: fit-content; height: fit-content; min-width: 100%; }
      img:not(table img) { max-width: 100%; height: auto !important; }
    </style>
    <div class="shadow-content"></div>
  `

  const content = shadowRoot.querySelector('.shadow-content')
  if (sanitized.bodyStyle) content.setAttribute('style', sanitized.bodyStyle)
  content.innerHTML = sanitized.html

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

watch(() => props.html, updateContent)
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
