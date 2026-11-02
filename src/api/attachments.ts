import { apiClient } from './client';
import { AttachmentRecord } from '../types';

export const MAX_ATTACHMENT_FILES = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.json,.zip,.docx,.xlsx';

/**
 * Downloads an attachment through the authenticated API client and returns a local object URL.
 * (A plain <img src> / window.open can't send the Bearer token, so the API would reject it.)
 * Callers must URL.revokeObjectURL() the result when done.
 */
export async function fetchAttachmentObjectUrl(attachment: AttachmentRecord): Promise<string> {
  const res: any = await apiClient.get(`/attachments/${attachment.id}/download`, { responseType: 'blob' });
  const blob: Blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: attachment.mime_type });
  const typed = blob.type ? blob : new Blob([blob], { type: attachment.mime_type });
  return URL.createObjectURL(typed);
}

/**
 * Saves an attachment to the user's device with its original file name.
 */
export async function downloadAttachment(attachment: AttachmentRecord): Promise<void> {
  const url = await fetchAttachmentObjectUrl(attachment);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.file_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Uploads files to a task via the multipart attachments endpoint and returns the created records.
 */
export async function uploadTaskAttachments(
  taskId: string,
  files: File[],
  context: 'SUBMISSION' | 'REFERENCE' = 'REFERENCE',
  onProgress?: (percent: number) => void
): Promise<AttachmentRecord[]> {
  if (files.length === 0) return [];

  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('context', context);

  const res: any = await apiClient.post(`/tasks/${taskId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total && onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });

  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}
