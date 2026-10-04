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
        <div class="content" v-for="message in displayedEmails" :key="message.emailId">
          <div class="email-info">
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

function openReply() {
  uiStore.writerRef.openReply(email.value)
}

function openForward() {
  uiStore.writerRef.openForward(email.value)
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

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.value.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.value.emailId]
      })
    } else  {

      allEmailDelete(email.value.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.value.emailId]
      })
    }

    router.back()
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
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 10px;
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;
    padding: 16px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);

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

      border-bottom: 1px solid var(--light-border-color);
      margin-bottom: 20px;
      padding-bottom: 8px;
      @media (max-width: 1024px) {
        margin-bottom: 15px;
      }
      .date {
        color: var(--regular-text-color);
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
