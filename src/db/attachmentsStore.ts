/**
 * Attachments Store with Memory Map + Disk Storage in `uploads/`
 */

import fs from 'fs';
import path from 'path';

export interface AttachmentRecord {
  id: string;
  task_id: string;
  uploaded_by_id: string;
  uploaded_by_name: string;
  file_key: string;         // unique on-disk name
  file_name: string;        // original name shown to users
  mime_type: string;
  size_bytes: number;
  context: 'SUBMISSION' | 'REFERENCE';
  submission_round: number; // which submission cycle this belongs to
  created_at: string;
}

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class AttachmentsStore {
  private attachments: Map<string, AttachmentRecord> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    // Empty initial attachments state or system boot defaults
  }

  create(record: AttachmentRecord): AttachmentRecord {
    this.attachments.set(record.id, record);
    return record;
  }

  getByTask(taskId: string): AttachmentRecord[] {
    const list: AttachmentRecord[] = [];
    for (const record of this.attachments.values()) {
      if (record.task_id === taskId) {
        list.push(record);
      }
    }
    // Newest created_at first
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  getById(id: string): AttachmentRecord | undefined {
    return this.attachments.get(id);
  }

  getByFileKey(fileKey: string): AttachmentRecord | undefined {
    for (const record of this.attachments.values()) {
      if (record.file_key === fileKey) {
        return record;
      }
    }
    return undefined;
  }

  getSubmissionsByTask(taskId: string): AttachmentRecord[] {
    return this.getByTask(taskId).filter((a) => a.context === 'SUBMISSION');
  }

  getByTaskAndRound(taskId: string, round: number): AttachmentRecord[] {
    return this.getByTask(taskId).filter((a) => a.submission_round === round);
  }

  deleteById(id: string): boolean {
    const record = this.attachments.get(id);
    if (!record) return false;

    // Remove disk file if present
    const filePath = path.join(UPLOADS_DIR, record.file_key);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`[attachmentsStore] Error unlinking file ${record.file_key}:`, err);
      }
    }

    return this.attachments.delete(id);
  }
}

export const attachmentsStore = new AttachmentsStore();
