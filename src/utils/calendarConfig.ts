export interface EventCategoryDefinition {
  key: string;
  label: string;
  color: string; // HEX color for FullCalendar and style markers
  textColor: string; // High contrast text color
  bgClass: string;
  textClass: string;
  borderClass: string;
  badgeBg: string;
  badgeText: string;
}

export const EVENT_CATEGORIES: Record<string, EventCategoryDefinition> = {
  MEETING: {
    key: 'MEETING',
    label: 'Team Meetings',
    color: '#2563eb', // Blue
    textColor: '#ffffff',
    bgClass: 'bg-blue-600',
    textClass: 'text-blue-600',
    borderClass: 'border-blue-600',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
  },
  CLIENT_MEETING: {
    key: 'CLIENT_MEETING',
    label: 'Client Meetings',
    color: '#10b981', // Green
    textColor: '#ffffff',
    bgClass: 'bg-emerald-500',
    textClass: 'text-emerald-600',
    borderClass: 'border-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
  },
  TASK: {
    key: 'TASK',
    label: 'Assigned Tasks',
    color: '#8b5cf6', // Purple
    textColor: '#ffffff',
    bgClass: 'bg-purple-500',
    textClass: 'text-purple-600',
    borderClass: 'border-purple-500',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
  },
  DEADLINE: {
    key: 'DEADLINE',
    label: 'Task Deadlines',
    color: '#ef4444', // Red
    textColor: '#ffffff',
    bgClass: 'bg-red-500',
    textClass: 'text-red-600',
    borderClass: 'border-red-500',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
  },
  REMINDER: {
    key: 'REMINDER',
    label: 'Reminders',
    color: '#eab308', // Yellow
    textColor: '#78350f', // Dark amber for readability on yellow
    bgClass: 'bg-yellow-500',
    textClass: 'text-yellow-700',
    borderClass: 'border-yellow-500',
    badgeBg: 'bg-yellow-50',
    badgeText: 'text-yellow-800',
  },
  HOLIDAY: {
    key: 'HOLIDAY',
    label: 'Holidays / Rest',
    color: '#64748b', // Grey
    textColor: '#ffffff',
    bgClass: 'bg-slate-500',
    textClass: 'text-slate-600',
    borderClass: 'border-slate-500',
    badgeBg: 'bg-slate-50',
    badgeText: 'text-slate-700',
  },
  OTHER: {
    key: 'OTHER',
    label: 'Other Events',
    color: '#3b82f6',
    textColor: '#ffffff',
    bgClass: 'bg-blue-500',
    textClass: 'text-blue-600',
    borderClass: 'border-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
  },
};

/**
 * Returns default color for an event type or falls back to meeting blue.
 */
export function getCategoryColor(category?: string | null): string {
  if (!category) return EVENT_CATEGORIES.MEETING.color;
  return EVENT_CATEGORIES[category]?.color || EVENT_CATEGORIES.MEETING.color;
}

/**
 * Returns high-contrast text color for a given background color hex.
 */
export function getCategoryTextColor(colorHex?: string | null, category?: string | null): string {
  if (category && EVENT_CATEGORIES[category]) {
    return EVENT_CATEGORIES[category].textColor;
  }
  if (colorHex) {
    const hex = colorHex.toLowerCase();
    if (hex === '#eab308' || hex === '#f59e0b' || hex === '#fbbf24' || hex === '#facc15') {
      return '#78350f';
    }
  }
  return '#ffffff';
}

/**
 * Color swatches available in modal with category correlation
 */
export const COLOR_SWATCHES = [
  { label: 'Team Meetings (Blue)', value: '#2563eb', bg: 'bg-blue-600', categoryKey: 'MEETING' },
  { label: 'Client Meetings (Green)', value: '#10b981', bg: 'bg-emerald-500', categoryKey: 'CLIENT_MEETING' },
  { label: 'Assigned Tasks (Purple)', value: '#8b5cf6', bg: 'bg-purple-500', categoryKey: 'TASK' },
  { label: 'Task Deadlines (Red)', value: '#ef4444', bg: 'bg-red-500', categoryKey: 'DEADLINE' },
  { label: 'Reminders (Yellow)', value: '#eab308', bg: 'bg-yellow-500', categoryKey: 'REMINDER' },
  { label: 'Holidays / Rest (Grey)', value: '#64748b', bg: 'bg-slate-500', categoryKey: 'HOLIDAY' },
];
