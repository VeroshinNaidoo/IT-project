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

## FR-26 Pixel Car Racer solo-vs-Bot smoke test

1. Sign in as an enrolled student and open a practice quiz containing at least 10 explained questions. Confirm **Play Pixel Car Racer** appears. On a competitive quiz without a completed scored attempt, confirm only the locked reason is shown.
2. Start the race. Confirm the player and clearly labelled **Bot** share a track, speed starts at 2 of 5, score/streak/slots are visible as text, and the pending question contains no correctness marker.
3. Answer four questions correctly. Confirm speed increases but never exceeds 5, streak reaches four, and nitro is announced for the next question.
4. Answer the next three correctly. Confirm **NITRO ACTIVE, answers worth double**, doubled points and distance, two consumed slots per answer, and that the ten-slot race finishes after seven answers in this worked run.
5. In a replay, answer incorrectly while nitro is active. Confirm speed drops by one but not below 1, streak resets to zero, nitro ends, points do not decrease, and one slot is consumed.
6. Refresh while a question is pending. Confirm the same play and question resume without revealing the correct answer.
7. Confirm the result reports player/Bot distance, points, answers used, and win/Bot win/shared outcome. Select **Race again**, then verify no race result appears in the leaderboard, scored attempts, or lecturer analytics.

## FR-24 Timer Trivia solo smoke test

1. Sign in as an enrolled student and open a practice quiz with at least 10 explained questions across topic/level cells. Confirm **Play Timer Trivia** appears; on a competitive quiz before the scored attempt, confirm the locked reason is shown.
2. Start Timer Trivia. Confirm the board shows topic columns and point rows 10, 20, 30, 40, and 50, while no question text or correctness is exposed.
3. Choose an open cell, confirm the question and options appear with textual time remaining, and submit the correct answer. Confirm the server-owned points and explanation are announced.
4. Let a round expire. Confirm it records a timeout and zero points, then the board marks the cell used. Try to reuse it and confirm it is rejected.
5. Enable the extended-time profile preference and confirm the server deadline doubles. Refresh mid-round and confirm the same active question and deadline continue without revealing correctness.
6. Complete ten rounds. Confirm the terminal screen reports the score and offers **Play again** and **Back to quiz**.
7. Return to the leaderboard and analytics. Confirm Timer Trivia did not change scored attempts, ranks, or analytics percentages.

## Games chooser smoke test

1. Sign in as a student and select **Games** in the sidebar. Confirm six enabled cards appear: Infected, Island Escape, Memory Match, Boss Battle, Pixel Car Racer and Timer Trivia. Confirm each has an original icon, plain-language description, Solo/Practice-only tags, and its minimum question count.
2. Confirm **Multiplayer rooms — Coming soon** is labelled and disabled with no dead action.
3. Select a game. Confirm the quiz picker shows only quizzes from enrolled modules, with module names, practice/competitive labels, search, and pagination.
4. Confirm a competitive quiz before its scored attempt explains the lock, a short quiz gives its minimum-question reason, and a closed or unpublished quiz gives its exact reason.
5. Start an available quiz. Return to **Games** and confirm the game card and quiz row show **Resume** and **Continue**. Confirm Continue resumes through the existing start route.
6. Sign in as a lecturer. Confirm **Games** is visible as a read-only preview of owned-module quizzes and never starts a student play.

## Registration and email verification

1. Open registration and enter a Unicode first name, optional last name, student type, and a password meeting all five strength rules.
2. Confirm the password and register.
3. Confirm the account is created with a verification banner.
4. In development, open the matching ignored file under `docs/dev-mail/` and use the verification link once.
5. Confirm the first use succeeds and refreshing/reusing the same link is rejected.
6. Try digits or symbols in the name, a weak password, a mismatched confirmation, and a duplicate email; each must be rejected with a generic validation response.

## Profile smoke test

1. Open Edit profile from the sidebar or header, change a name and select preferred languages, then save.
2. Confirm an unsaved-change warning appears before saving and that the success message appears after saving.
3. Try a profane name and a protected field; confirm the generic validation error and no sensitive data in the response.
4. Change email and confirm the old email remains active until the development verification link is used.
5. Change password, confirm the current session remains active and another session is signed out.
6. Review MFA status and use the existing enrolment/disable/recovery-code actions.

## Practice Lab smoke test

1. Sign in as a student enrolled in the IT first-year module and open **Practice Labs**.
2. Open **Headings and paragraphs**. Confirm the HTML, CSS and JavaScript tabs, line numbers and live preview are visible.
3. Type a heading, select **Run**, and confirm the preview changes. Use **Reset** and confirm the starter code returns.
4. Confirm the preview iframe has scripts enabled only, no forms/popups/navigation, and the console displays output as text.
5. Save a draft, refresh, reopen the lab, and confirm the saved progress is restored. No code is sent before Save.
6. Enter an infinite loop and confirm the watchdog shows “Your code ran too long and was stopped”.
7. As a lecturer, create, edit, preview and publish a lab on an owned module. Confirm another lecturer cannot access it and activity shows aggregate counts only.

## Business Lab smoke test

1. Open **Practice Labs** as a Business student and choose **Budget spreadsheet**.
2. Enter formulas such as `=SUM(B3:B5)` and use arrows, Enter and Tab to move between cells. Confirm locked cells cannot be edited.
3. Try `=A1/0`, `=A1+A1` in A1, and an unknown function. Confirm `#DIV/0!`, `#CIRC!` and `#NAME?` appear as text with explanations.
4. Save and refresh. Confirm the grid restores and progress remains self-checked.
5. Open **Break-even calculator**, change the inputs and confirm the result and formula working update.
6. Open the seeded business scenario, make each choice, confirm meters and the reflection summary, and confirm no result appears on the leaderboard.

## Business Lab completion smoke test

1. As a lecturer, open Practice Labs and create a spreadsheet draft, calculator draft and scenario draft for an owned module; publish, duplicate and unpublish one draft.
2. As a student enrolled in the module, open the spreadsheet, move with arrows/Enter/Tab, confirm locked cells cannot be edited, save, and inspect the check panel without seeing expected values.
3. Open the scenario, choose a branch, confirm meter text/bars and the reflection summary, refresh, then restart.
4. Confirm a lecturer cannot open a student attempt and a student cannot access lecturer authoring actions.

### Manual quiz authoring

1. Log in as a lecturer and open Quizzes > Create quiz.
2. Select a module, choose Practice or Competitive, add a multiple-choice question, and save a draft.
3. Try publishing with placeholder text or two correct answers; confirm the checklist blocks it.
4. Add a short-answer and code question, preview them, then publish a valid draft.
5. Log in as a student and confirm authoring routes return 403 and answers are not visible before submission.

6. Add a short-answer question with two accepted answers and ignore-punctuation enabled. Take it as a student using different case and punctuation; confirm marks and feedback are correct. Submit blank and confirm it is unanswered. Add a code question and confirm its before snippet is visible before submit while the after snippet appears only in feedback.
7. Save a lecturer draft, run **Run publish checklist**, and confirm an empty or unanswerable draft is blocked with a useful issue. Confirm the student preview never creates an attempt. For a complete mixed quiz, publish one multiple-choice, true/false, short-answer and code question, take it as a student, verify the score on the leaderboard, and confirm a second competitive attempt is rejected.

## Study sessions and calendar

1. Sign in as a group leader, open **Study groups** and choose **Study sessions** for a group. Create a one-hour session, then create two weekly occurrences. Confirm each is separately visible and editable.
2. Try an overlapping time. Confirm it is saved with a warning rather than blocked. Try a past start, an eight-hour-plus duration, or an `http:` online link; confirm each is rejected.
3. Add a preparation resource, open it as a group member, then try using a resource from another module; confirm the latter is refused.
4. Switch between list, month and week views with keyboard Tab/Enter. Open a session, RSVP **Going**, **Maybe**, and **Not going**, and confirm only leaders see RSVP names.
5. Cancel a session with a reason. Confirm it remains displayed as cancelled and members receive an in-app notification. Check the bell’s unread count and mark one notification read.
6. Download the group and session `.ics` files. Leave the group as a member and confirm the calendar, details, resource download and RSVP are no longer accessible.
