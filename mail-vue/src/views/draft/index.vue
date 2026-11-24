<template>
  <emailScroll ref="scroll"
               :allow-star="false"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
               :show-first-loading="false"
               :showStar="false"
               @delete-draft="deleteDraft"
               :type="'draft'"
  >
    <template #name="props">
      <span class="send-email">{{ props.email.receiveEmail?.join(',') || '(' + $t('noRecipient') + ')' }}</span>
    </template>
    <template #subject="props">
      {{ props.email.subject || '(' + $t('noSubject') + ')' }}
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import {emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, ref, watch, toRaw} from "vue";
import {useUiStore} from "@/store/ui.js";
import {userDraftStore} from "@/store/draft.js";
import db from "@/db/db.js"
import {draftDelete as deleteServerDraft, draftList} from "@/request/draft.js";

defineOptions({
  name: 'draft'
})

const draftStore = userDraftStore();
const uiStore = useUiStore();
const scroll = ref({})

watch(() => draftStore.setDraft, async () => {

  const draft = toRaw(draftStore.setDraft)
  const draftId = draft.draftId
  const attachments = toRaw(draftStore.setDraft.attachments)

  delete draft.draftId
  delete draft.attachments

  if (!draft.content && !draft.subject && !(draft.receiveEmail.length > 0)) {
    await db.value.draft.delete(draftId);
    await db.value.att.delete(draftId);
    draftStore.refreshList++
    return;
  }

  await db.value.draft.update(draftId, draft);
  await db.value.att.update(draftId, {attachments: attachments});
  draftStore.refreshList++
}, {
  deep: true
})

watch(() => draftStore.refreshList, async () => {
  const {list} = await getEmailList();
    scroll.value.emailList.length = 0
    scroll.value.handleList(list);
    scroll.value.emailList.push(...list)
})

async function localDrafts() {
  try {
    if (!db.value?.draft?.orderBy) return []
    return await db.value.draft.orderBy('createTime').reverse().toArray()
  } catch {
    return []
  }
}

async function getEmailList() {
  const [server, local] = await Promise.all([
    draftList().catch(() => []),
    localDrafts(),
  ])
  const list = [...(Array.isArray(server) ? server : []), ...local]
    .sort((left, right) => String(right.createTime).localeCompare(String(left.createTime)))
  return { list, total: list.length }
}

async function deleteDraft(items) {
  const selected = Array.isArray(items) ? items : []
  const localIds = selected.map(item => item.draftId).filter(Boolean)
  const serverIds = selected.map(item => item.serverDraftId).filter(Boolean)
  if (localIds.length) await db.value.draft.bulkDelete(localIds)
  await Promise.all(serverIds.map(id => deleteServerDraft(id)))
  draftStore.refreshList++
}

async function jumpContent(email) {
  if (!email.serverDraftId) {
    const att = await db.value.att.get(email.draftId)
    email.attachments = att?.attachments || []
    uiStore.writerRef.openDraft(email)
    return
  }
  uiStore.writerRef.openDraft({ ...email, draftId: null });
}

</script>
<style>
.send-email {
  font-weight: normal;
}
</style>
