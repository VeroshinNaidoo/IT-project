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

## FR-28 Island Escape solo smoke test

1. Seed data, sign in as a demo student, open the 40-question demo quiz, and choose **Play Island Escape**. Confirm Phase 1, Question 1 of 10, wrong answers 0 of 5, streak 0, three retries, and score 0 are visible.
2. Inspect the network response and UI before answering. Confirm options are present but no `isCorrect`, correct-option marker, or explanation is exposed.
3. For a perfect run, submit the correct option for all 30 questions. Confirm the first three answers score 10 each, later consecutive answers score 20, the streak carries between phases, final score is 570, and **You reached the mainland** appears.
4. Start a replay. In Phase 1, answer five questions incorrectly. Confirm the fifth answer immediately shows **Your tools were lost**, Phase 1 restarts at zero progress, streak resets, earned score remains, and two retries remain.
5. Continue causing setbacks until the fourth setback. Confirm the terminal screen says **Stranded**, no further answer is accepted, and the final score/personal best are displayed.
6. Start or resume a play, note the question, refresh before answering, and confirm the same play and pending question return without correctness.
7. Return to the quiz leaderboard and lecturer analytics. Confirm the Island score and personal best do not alter any scored attempt, rank, or percentage.

## FR-23 Memory Match solo smoke test

1. Run the seed, sign in as `demo-student-1@example.com`, open **Quizzes**, select **Database Systems**, and open **Demo practice quiz**.
2. Confirm **Play Memory Match** is present. On a competitive quiz for a student without a completed scored attempt, confirm only the locked reason appears and no play button is shown.
3. Start the game. Confirm the 12 card backs identify question versus answer cards but reveal no question text, answer text, or pairing.
4. Flip one question card, then refresh the page. Return to the practice quiz and select **Play Memory Match** again. Confirm the same play resumes and only the previously face-up card and any matched cards reveal text.
5. Flip an answer card from a different pair. Confirm the mismatch is announced in the live region, the score never becomes negative, and both cards turn face down after about one second (immediately when reduced motion is preferred).
6. Match every question with its correct answer. Confirm each pair locks face up, score/moves/pairs-found remain visible as text, and keyboard Enter or Space operates every available card.
7. Confirm the terminal screen says **Every pair matched**, reports the final score and moves, and offers **Play again** and **Back to quiz**.
8. Return to the leaderboard and analytics. Confirm the Memory Match score did not alter a scored attempt, rank, or analytics percentage.

## FR-25 Boss Battle solo smoke test

1. Sign in as an enrolled student and open a practice quiz containing at least 12 explained questions. Confirm **Play Boss Battle** appears. On a competitive quiz without a completed scored attempt, confirm the locked reason appears and no play button is shown.
2. Start Boss Battle. Confirm both HP bars show **100%** as text, the original boss illustration is visible, four options are keyboard-operable, and no correct answer is shown before submission.
3. Submit a wrong hard answer. Confirm player HP loses 20, boss HP does not change, the correct answer and explanation are announced, and **Continue** reveals the next unused question.
4. Submit correct answers across easy, medium, and hard questions. Confirm boss damage is 10, 15, and 25 respectively, score only increases by boss damage, and the boss illustration progresses through four labelled damage states.
5. Continue until boss HP reaches zero. Confirm the **Boss defeated** terminal screen shows final score/HP and offers **Play again** and **Back to quiz**.
6. In separate plays, answer incorrectly until player HP reaches zero and exhaust all questions before either HP reaches zero. Confirm **The boss prevailed** and **Questions exhausted** terminal screens respectively.
7. Refresh while a question is pending. Confirm the same play and question return without correctness. Return to leaderboard and analytics and confirm the game changed neither scored attempts nor percentages.
