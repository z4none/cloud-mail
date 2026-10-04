<template>
  <div class="box">
    <div class="header-actions">
      <Icon class="icon" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20" @click="handleBack"/>
      <Icon v-perm="'email:delete'" class="icon" icon="uiw:delete" width="16" height="16" @click="handleDelete"/>
      <span class="star" v-if="emailStore.contentData.showStar">
        <Icon class="icon" @click="changeStar" v-if="email.isStar" icon="fluent-color:star-16" width="20" height="20"/>
        <Icon class="icon" @click="changeStar" v-else icon="solar:star-line-duotone" width="18" height="18"/>
      </span>
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openReply" icon="la:reply" width="21" height="21" />
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          {{ email.subject }}
        </div>
        <div
            v-for="message in displayedEmails"
            :key="message.emailId"
            :class="['content', { 'is-sent': message.type === 1, 'is-latest': message.emailId === latestMessageId }]"
        >
          <div class="email-info">
            <div class="message-avatar" :aria-label="message.name || message.sendEmail">
              {{ senderInitial(message) }}
            </div>
            <div class="message-meta">
            <div>
              <div class="send"><span class="send-source">{{$t('from')}}</span>
                <div class="send-name">
                  <span class="send-name-title">{{ message.name }}</span>
                  <span><{{ message.sendEmail }}></span>
                </div>
              </div>
              <div class="receive"><span class="source">{{$t('recipient')}}</span><span class="receive-email">{{  formateReceive(message.recipient) }}</span></div>
              <div class="date">
                <div>{{ formatDetailDate(message.createTime) }}</div>
              </div>
            </div>
            <el-alert v-if="message.status === 3" :closable="false" :title="toMessage(message.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="message.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="message.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
            </div>
            <div class="message-actions">
              <button v-if="emailStore.contentData.showReply" v-perm="'email:send'" type="button" :title="$t('reply')" @click="openReply(message)">
                <Icon icon="la:reply" width="18" height="18" />
              </button>
              <button v-if="emailStore.contentData.showReply" v-perm="'email:send'" type="button" :title="$t('forward')" @click="openForward(message)">
                <Icon icon="iconoir:arrow-up-right" width="17" height="17" />
              </button>
              <button v-perm="'email:delete'" type="button" :title="$t('delete')" @click="handleDelete(message)">
                <Icon icon="uiw:delete" width="15" height="15" />
              </button>
            </div>
          </div>
          <el-scrollbar class="htm-scrollbar" :class="!message.attList?.length ? 'bottom-distance' : ''">
            <ShadowHtml class="shadow-html" :html="formatImage(message.content)" v-if="message.content" />
            <pre v-else class="email-text" >{{message.text}}</pre>
          </el-scrollbar>
          <div class="att" v-if="message.attList?.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: message.attList.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in message.attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <button class="download-button" type="button" @click="downloadAttachment(att)">
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {computed, reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead, emailThread} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {downloadObject, loadObjectUrl} from "@/utils/object.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";

const uiStore = useUiStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = computed(() => emailStore.contentData.email || {
  emailId: 0,
  attList: [],
  content: '',
  text: '',
  recipient: '[]',
})
const showPreview = ref(false)
const srcList = reactive([])
const threadEmails = ref([])
const displayedEmails = computed(() => threadEmails.value.length ? threadEmails.value : [email.value])
const latestMessageId = computed(() => displayedEmails.value.at(-1)?.emailId)

function senderInitial(message) {
  return (message.name || message.sendEmail || '?').trim().charAt(0).toUpperCase()
}

const { t } = useI18n()

async function loadThread(emailId) {
  if (!emailId) {
    threadEmails.value = []
    return
  }
  try {
    const list = await emailThread(emailId)
    threadEmails.value = Array.isArray(list) ? list : []
    for (const item of threadEmails.value) {
      item.attList ||= []
      emailStore.detailMap[item.emailId] = item
    }
  } catch (error) {
    console.error(error)
    threadEmails.value = []
  }
}

watch(() => email.value?.emailId, loadThread, { immediate: true })
watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

let readRequesting = false

function tryMarkRead() {
  if (!emailStore.contentData.showUnread || readRequesting) return
  const current = email.value
  if (!current?.emailId || current.unread !== EmailUnreadEnum.UNREAD) return

  // 等详情数据就绪（detailMap 已写入，或正文已有内容）再标已读
  const full = emailStore.detailMap[current.emailId]
  const detailReady = !!full || !!(current.content || current.text)
  if (!detailReady) return

  readRequesting = true
  const emailId = current.emailId
  current.unread = EmailUnreadEnum.READ
  if (emailStore.detailMap[emailId]) {
    emailStore.detailMap[emailId].unread = EmailUnreadEnum.READ
  }
  emailStore.markListRead(emailId)
  emailRead([emailId]).finally(() => {
    readRequesting = false
  })
}

watch(
  () => [
    email.value?.emailId,
    email.value?.content,
    email.value?.text,
    emailStore.detailMap[email.value?.emailId]
  ],
  () => tryMarkRead(),
  { flush: 'post' }
)

onMounted(() => {
  tryMarkRead()
  window.addEventListener('keydown', handleKeyDown);
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
  readRequesting = false
  window.removeEventListener('keydown', handleKeyDown);
})

function handleKeyDown(event) {
  if (event.key !== 'Escape') return;
  if (showPreview.value) return;
  if (document.querySelector('.el-message-box')) return;
  const writeBox = document.querySelector('.write-box');
  if (writeBox && writeBox.offsetParent !== null) return;
  handleBack();
}

function openReply(message = email.value) {
  uiStore.writerRef.openReply(message)
}

function openForward(message = email.value) {
  uiStore.writerRef.openForward(message)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  return content || '';
}

async function showImage(key) {
  if (!isImage(key)) return;
  try {
    const url = await loadObjectUrl(key)
    srcList.length = 0
    srcList.push(url)
    showPreview.value = true
  } catch {
    ElMessage.error(t('networkErrorMsg'))
  }
}

async function downloadAttachment(att) {
  try {
    await downloadObject(att.key, att.filename)
  } catch {
    ElMessage.error(t('networkErrorMsg'))
  }
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  if (!recipient) return ''
  recipient = JSON.parse(recipient)
  return recipient.map(item => item.address).join(', ')
}

function changeStar() {
  if (email.value.isStar) {
    email.value.isStar = 0;
    starCancel(email.value.emailId).then(() => {
      email.value.isStar = 0;
      emailStore.cancelStarEmailId = email.value.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.value.emailId])
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 1;
    })
  } else {
    email.value.isStar = 1;
    starAdd(email.value.emailId).then(() => {
      email.value.isStar = 1;
      emailStore.addStarEmailId = email.value.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email.value)
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 0;
    })
  }
}

const handleBack = () => {
  router.back()
}

const handleDelete = (message = email.value) => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(message.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [message.emailId]
        threadEmails.value = threadEmails.value.filter(item => item.emailId !== message.emailId)
      })
    } else  {

      allEmailDelete(message.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [message.emailId]
        threadEmails.value = threadEmails.value.filter(item => item.emailId !== message.emailId)
      })
    }

    if (message.emailId === email.value.emailId) router.back()
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px 8px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: var(--header-actions-border);
  font-size: 18px;
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
  }
}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  min-height: 100%;
  padding: clamp(14px, 2vw, 28px);
  background: var(--el-fill-color-lighter);
  @media (max-width: 1023px) {
    padding: 12px;
  }

  .email-title {
    font-size: clamp(19px, 2vw, 24px);
    font-weight: 650;
    letter-spacing: -0.02em;
    margin: 2px 4px 16px;
    color: var(--el-text-color-primary);
  }

  .htm-scrollbar {
  }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    margin-bottom: 14px;
    padding: clamp(16px, 2.5vw, 26px);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 12px;
    background: var(--el-bg-color);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--el-text-color-primary) 7%, transparent);
    overflow: hidden;

    &.is-latest {
      border-color: color-mix(in srgb, var(--el-color-primary) 40%, var(--el-border-color-lighter));
      box-shadow: 0 8px 24px color-mix(in srgb, var(--el-color-primary) 10%, transparent);
    }

    &.is-sent {
      background: color-mix(in srgb, var(--el-color-primary) 6%, var(--el-bg-color));

      &::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: var(--el-color-primary);
      }

      .message-avatar {
        background: var(--el-color-primary);
        color: var(--el-color-white);
      }
    }

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a, .download-button {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }

          .download-button {
            border: 0;
            background: transparent;
            padding: 0;
            cursor: pointer;
          }
        }
      }
    }

    .email-info {
      display: flex;
      gap: 12px;
      border-bottom: 1px solid var(--light-border-color);
      margin-bottom: 20px;
      padding-bottom: 16px;

      .message-avatar {
        flex: 0 0 36px;
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--el-fill-color-dark);
        color: var(--el-text-color-primary);
        font-size: 14px;
        font-weight: 700;
      }

      .message-meta {
        min-width: 0;
        flex: 1;
      }

      .message-actions {
        display: flex;
        gap: 2px;
        align-self: flex-start;
        opacity: 0.68;
        transition: opacity 160ms ease-out;

        button {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 7px;
          color: var(--secondary-text-color);
          background: transparent;
          cursor: pointer;

          &:hover, &:focus-visible {
            color: var(--el-color-primary);
            background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
            outline: none;
          }
        }
      }

      &:hover .message-actions, .message-actions:focus-within {
        opacity: 1;
      }

      @media (max-width: 1024px) {
        gap: 10px;
        margin-bottom: 15px;

        .message-actions {
          opacity: 1;
        }
      }
      .date {
        color: var(--secondary-text-color);
        font-size: 12px;
        margin-bottom: 6px;
      }

      .email-msg {
        max-width: 400px;
        width: fit-content;
        margin-bottom: 15px;
      }

      .send {
        display: flex;
        margin-bottom: 6px;

        .send-name {
          color: var(--regular-text-color);
          display: flex;
          flex-wrap: wrap;
        }

        .send-name-title {
          padding-right: 5px;
        }
      }

      .receive {
        margin-bottom: 6px;
        display: flex;
        .receive-email {
          max-width: 700px;
          word-break: break-word;
        }
        span:nth-child(2) {
          color: var(--regular-text-color);
        }
      }

      .send-source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }

      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }
  }
}

.shadow-html::after  {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--message-block-color); /* 半透明黑色蒙层 */
  pointer-events: none; /* 不影响点击 */
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}


</style>
