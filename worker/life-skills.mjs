// Classroom time is recorded on each resident. Foundational instincts remain
// available while supervised lessons build practical skills.
export const LIFE_SKILLS = ['home', 'nutrition', 'health', 'transit', 'driving', 'money', 'civic'];
const LESSON_SECONDS = 1200;

export function readyToDrive(resident) {
  return resident.ageYears >= 18 && (!resident.lifeSkillsOnboarding || resident.lifeSkills?.minutes?.driving >= LESSON_SECONDS / 60);
}

export function lifeSkillsLesson(resident, { now, elapsed, schoolId, supervised, earlyCare = false }) {
  if (!supervised || resident.traveling || resident.onTrain || resident.onPlane || resident.sleeping) return null;
  const profile = resident.lifeSkills ??= { minutes: {}, completed: [] };
  if (Number(profile.lastLessonAt ?? -1) >= now) return null;
  const amount = Math.max(0, Math.min(300, elapsed, now - Number(profile.lastLessonAt ?? now - elapsed))) / 60;
  profile.lastLessonAt = now;
  const curriculum = earlyCare ? LIFE_SKILLS.slice(0, 3) : LIFE_SKILLS;
  const subject = curriculum.find(skill => Number(profile.minutes[skill] || 0) < LESSON_SECONDS / 60);
  if (!subject || !amount) return null;
  profile.minutes[subject] = Math.min(LESSON_SECONDS / 60, (profile.minutes[subject] || 0) + amount);
  profile.schoolId = schoolId;
  if (profile.minutes[subject] < LESSON_SECONDS / 60) return null;
  profile.completed.push(subject);
  if (subject === 'driving') resident.lawAwareness = Math.min(1, Number(resident.lawAwareness ?? .65) + .06);
  if (profile.completed.length === LIFE_SKILLS.length) profile.graduatedAt = now;
  return subject;
}
