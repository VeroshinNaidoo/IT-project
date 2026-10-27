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

## FR-22 Infected solo smoke test

1. Seed demo data, sign in as `demo-student-1@example.com`, open **Quizzes**, and select **Database Systems**.
2. Confirm Infected appears only because its catalog row is enabled. A competitive quiz must show a locked reason until that student has completed the scored attempt.
3. Select **Play Infected**. Confirm `Cure 0% · Infection 100%`, `3 of 3 hearts`, and `Score 0` are visible.
4. Confirm cards reveal only difficulty, topic, reward, and penalty. Choose a card and confirm its question/options appear without a correctness indicator.
5. Submit a known wrong answer. Confirm cure decreases by the shown penalty but not below zero, exactly one heart is lost, score does not decrease, and feedback announces the correct answer plus explanation.
6. Select **Continue**, answer correct cards, and confirm cure and score increase by 10/20/30 for Easy/Medium/Hard.
7. Refresh after choosing a card but before answering. Confirm the same session and pending question resume without revealing correctness.
8. Continue until **Cure complete — you win!** appears. Confirm no further card can be chosen, then select **Play again** to create a new session.
9. In a replay, intentionally answer three questions incorrectly. Confirm **No hearts left** and no further moves.
10. Play a six-question quiz without reaching 100 cure. Confirm **Questions exhausted** shows final cure and score.
11. Return to leaderboard and lecturer analytics. Confirm Infected scores and sessions are absent from scored quiz results.
