import { describe, expect, it } from 'vitest';
import { recommendationReason, scoreGroup } from './recommendations.js';

describe('study group recommendations', () => {
  const student = {
    studentType: 'it',
    studentYear: 1,
    moduleIds: ['m1'],
    preferredLanguages: ['Python', 'SQL'],
  };
  const group = {
    moduleId: 'm1',
    year: 1,
    programme: 'it',
    languages: ['Python', 'Java'],
    focus: 'Databases',
  };

  it('scores and explains the same fixed input deterministically', () => {
    expect(scoreGroup(student, group)).toBe(80);
    expect(scoreGroup(student, group)).toBe(scoreGroup(student, group));
    expect(recommendationReason(student, group)).toBe(
      'Matches your languages: Python; Matches your module',
    );
  });

  it('does not expose profile details in the recommendation reason', () => {
    expect(
      recommendationReason(student, { ...group, languages: [] }),
    ).not.toContain('studentType');
    expect(
      recommendationReason(student, { ...group, languages: [] }),
    ).toContain('Matches your module');
  });
});
