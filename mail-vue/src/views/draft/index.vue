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
import {draftDelete, draftList} from "@/request/draft.js";
import {defineOptions, ref, watch} from "vue";
import {useUiStore} from "@/store/ui.js";
import {userDraftStore} from "@/store/draft.js";

defineOptions({
  name: 'draft'
})

const draftStore = userDraftStore();
const uiStore = useUiStore();
const scroll = ref({})

watch(() => draftStore.refreshList, async () => {
  const {list} = await getEmailList();
  scroll.value.emailList.length = 0
  scroll.value.handleList(list);
  scroll.value.emailList.push(...list)
})

async function getEmailList() {
  const list = await draftList().catch(() => [])
  const drafts = Array.isArray(list) ? list : []
  return { list: drafts, total: drafts.length }
}

async function deleteDraft(items) {
  const ids = (Array.isArray(items) ? items : [])
    .map(item => item.serverDraftId || item.draftId)
    .filter(Boolean)
  await Promise.all(ids.map(id => draftDelete(id)))
  draftStore.refreshList++
}

function jumpContent(email) {
  uiStore.writerRef.openDraft({ ...email, serverDraftId: email.serverDraftId || email.draftId, draftId: null })
}

</script>
<style>
.send-email {
  font-weight: normal;
}
</style>
