import http from '@/axios/index.js';

export function draftList() {
    return http.get('/draft/list')
}

export function draftUpdate(draftId, draft) {
    return http.put('/draft/' + draftId, draft)
}

export function draftDelete(draftId) {
    return http.delete('/draft/' + draftId)
}
