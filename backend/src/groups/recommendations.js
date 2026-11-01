// @ts-nocheck - recommendation inputs are validated at the API boundary.
export function scoreGroup(student, group) {
  let score = 0;
  if (student.moduleIds?.includes(group.moduleId)) score += 30;
  if (student.studentYear && group.year === student.studentYear) score += 20;
  if (
    student.studentType &&
    (group.programme === student.studentType || group.programme === 'both')
  )
    score += 20;
  const preferred = new Set(student.preferredLanguages || []);
  const overlap = (group.languages || []).filter((language) =>
    preferred.has(language),
  );
  score += Math.min(overlap.length * 10, 20);
  if (
    group.focus &&
    student.focuses?.some((focus) =>
      group.focus.toLowerCase().includes(focus.toLowerCase()),
    )
  )
    score += 10;
  return score;
}

export function recommendationReason(student, group) {
  const reasons = [];
  const overlap = (group.languages || []).filter((language) =>
    (student.preferredLanguages || []).includes(language),
  );
  if (overlap.length)
    reasons.push(`Matches your languages: ${overlap.join(', ')}`);
  if (student.moduleIds?.includes(group.moduleId))
    reasons.push('Matches your module');
  if (student.studentYear === group.year)
    reasons.push(`Matches Year ${group.year}`);
  if (
    student.studentType &&
    (group.programme === student.studentType || group.programme === 'both')
  )
    reasons.push(`Matches your ${student.studentType} programme`);
  return reasons.slice(0, 2).join('; ') || 'A group in one of your modules';
}
