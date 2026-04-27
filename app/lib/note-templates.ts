import type { NoteTemplatePreset } from '@/components/notes/note-form';

export const NOTE_TEMPLATES: NoteTemplatePreset[] = [
  {
    id: 'meeting',
    label: 'Meeting',
    title: 'Meeting Notes',
    content: 'Agenda:\n- \n\nDecisions:\n- \n\nAction items:\n- ',
  },
  {
    id: 'journal',
    label: 'Journal',
    title: 'Daily Journal',
    content: 'Today I worked on:\n- \n\nWins:\n- \n\nTomorrow:\n- ',
  },
  {
    id: 'checklist',
    label: 'Checklist',
    title: 'Checklist',
    content: '- [ ] \n- [ ] \n- [ ] ',
  },
];

export type NoteTemplateId = (typeof NOTE_TEMPLATES)[number]['id'];

export function getNoteTemplateById(templateId: string | null | undefined): NoteTemplatePreset | null {
  if (!templateId) {
    return null;
  }

  return NOTE_TEMPLATES.find((item) => item.id === templateId) ?? null;
}
