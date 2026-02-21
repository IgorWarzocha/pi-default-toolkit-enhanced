export const mastery = {
  tools: ['read', 'apply_patch'],
  status: 'demonstrated',
  date: '2026-02-21'
};

export function confirm() {
  return mastery.status === 'demonstrated';
}
