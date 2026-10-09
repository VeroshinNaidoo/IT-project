# EduQuest manual verification checklist

Run the local stack with `npm run dev`, then verify at 320px, 768px, and 1280px viewport widths in Chromium and Firefox.

- [ ] Register a student with a normal name; a profanity attempt shows only the generic 422 message.
- [ ] Log in as the seeded lecturer.
- [ ] Create a module and confirm the JoinCode is random and not the module code.
- [ ] Upload an allowed PDF and a spoofed PDF; only the valid file is accepted.
- [ ] Queue quiz generation, poll the job, and confirm a successful quiz is persisted transactionally.
- [ ] Publish a competitive quiz and confirm the amber “One scored attempt only.” banner.
- [ ] Log in as a student, enrol with JoinCode, and take the quiz.
- [ ] Confirm correct answers are not present in the start response.
- [ ] Confirm unanswered questions score zero and the second competitive attempt is blocked.
- [ ] View the module and group leaderboard and lecturer analytics.
- [ ] Verify keyboard focus, visible labels, error text, and no colour-only status cues.
