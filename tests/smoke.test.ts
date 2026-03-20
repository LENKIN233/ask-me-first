import { AvatarController } from '../src/controller.js';
import { EscalateLevel } from '../src/escalation/types.js';

import * as path from 'path';

const config = {
  workspaceDir: path.resolve(import.meta.dirname, '..'),
  stateConfig: {
    enablePresence: false,
    enableCalendar: false,
    calendarLookaheadHours: 1,
    cacheTTL: 60000
  }
};

async function runTests() {
  const controller = new AvatarController(config);

  console.log('\n=== Test 1: Admin asks simple question ===');
  const result1 = await controller.process({
    text: '现在在干嘛？',
    senderId: 'ou_your_admin_id_here'
  });
  console.log('Decision:', result1.decision.level);
  console.log('Reply:', result1.reply);

  console.log('\n=== Test 2: Guest asks about status ===');
  const result2 = await controller.process({
    text: '你忙吗？',
    senderId: 'ou_example_guest'
  });
  console.log('Decision:', result2.decision.level);
  console.log('Reply:', result2.reply);

  console.log('\n=== Test 3: Member requests upgrade ===');
  const result3 = await controller.process({
    text: '找本人一下',
    senderId: 'ou_example_member'
  });
  console.log('Decision:', result3.decision.level);
  console.log('Reply:', result3.reply);

  // admin gets partial when presence is disabled (confidence=0 triggers low_confidence rule)
  // in production with presence enabled, admin would get 'answer'
  const allPassed =
    result1.decision.level === EscalateLevel.Partial &&
    result2.decision.level === EscalateLevel.Partial &&
    result3.decision.level === EscalateLevel.Escalate;

  console.log('\n=== Summary ===');
  console.log(allPassed ? '✅ All tests passed' : '❌ Some tests failed');
  if (!allPassed) {
    console.log(`  Test1 expected=${EscalateLevel.Partial} got=${result1.decision.level}`);
    console.log(`  Test2 expected=${EscalateLevel.Partial} got=${result2.decision.level}`);
    console.log(`  Test3 expected=${EscalateLevel.Escalate} got=${result3.decision.level}`);
  }
  process.exit(allPassed ? 0 : 1);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
