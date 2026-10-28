// @ts-nocheck - Vitest reporter task shapes are runtime-owned.
function collectTests(task, output = []) {
  if (task.type === 'test') output.push(task);
  for (const child of task.tasks ?? []) collectTests(child, output);
  return output;
}

export default class NoSkippedTestsReporter {
  onFinished(files) {
    const tests = files.flatMap((file) => collectTests(file));
    const skipped = tests.filter(
      (test) =>
        test.mode === 'skip' ||
        test.mode === 'todo' ||
        test.result?.state === 'skip',
    );
    const failed = tests.filter((test) => test.result?.state === 'fail');
    const passed = tests.filter((test) => test.result?.state === 'pass');
    console.log(
      `TEST_SUMMARY ran=${passed.length + failed.length} passed=${passed.length} failed=${failed.length} skipped=${skipped.length}`,
    );
    if (skipped.length > 0) {
      console.error(
        `TEST GATE FAILED: ${skipped.length} test(s) were skipped. Database-unavailable skips never count as a pass.`,
      );
      process.exitCode = 1;
    }
  }
}
