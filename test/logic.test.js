const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../src/Logic.js');

test('upcoming Saturdays skip a Saturday that is today', () => {
  assert.deepEqual(
    logic.upcomingSaturdayIsos('2026-11-18', 3),
    ['2026-11-21', '2026-11-28', '2026-12-05']
  );
  assert.deepEqual(
    logic.upcomingSaturdayIsos('2026-11-21', 2),
    ['2026-11-28', '2026-12-05']
  );
});

test('new Saturdays append after the latest row and do not fill deleted gaps', () => {
  assert.deepEqual(
    logic.datesToAdd('2026-11-18', ['2026-11-21', '2026-12-05'], 4),
    ['2026-12-12']
  );
  assert.deepEqual(
    logic.datesToAdd('2026-11-18', [], 2),
    ['2026-11-21', '2026-11-28']
  );
});

test('the coordinator email is only for the coming Saturday on Thursday and Friday', () => {
  assert.equal(logic.imminentSaturday('2026-11-19'), '2026-11-21');
  assert.equal(logic.imminentSaturday('2026-11-20'), '2026-11-21');
  assert.equal(logic.imminentSaturday('2026-11-18'), '');
  assert.equal(logic.imminentSaturday('2026-11-21'), '');

  const base = {
    todayIso: '2026-11-19',
    saturdayIso: '2026-11-21',
    status: 'Open',
    count: 1,
    minimum: 2,
    max: 4,
    alreadySent: false,
  };
  assert.equal(logic.shouldNotifyLowSignup(base), true);
  assert.equal(logic.shouldNotifyLowSignup({ ...base, count: 0 }), true);
  assert.equal(logic.shouldNotifyLowSignup({ ...base, count: 2 }), false);
  assert.equal(logic.shouldNotifyLowSignup({ ...base, count: 4, minimum: 5 }), false);
  assert.equal(logic.shouldNotifyLowSignup({ ...base, status: 'Closed' }), false);
  assert.equal(logic.shouldNotifyLowSignup({ ...base, alreadySent: true }), false);
  assert.equal(logic.shouldNotifyLowSignup({ ...base, todayIso: '2026-11-20' }), true);
  assert.equal(logic.shouldNotifyLowSignup({ ...base, todayIso: '2026-11-18' }), false);
});

test('signup validation enforces the cap, the contact method, and duplicates', () => {
  const context = {
    todayIso: '2026-11-20',
    saturday: { date: '2026-11-21', status: 'Open', max: 4, count: 3 },
    existingFamilyNames: ['Nguyen'],
  };
  const good = logic.validateSignup({
    saturday: '2026-11-21',
    familyName: '  Patel  ',
    contactName: 'Anita Patel',
    remindBy: 'Both',
    email: 'Anita@Example.com',
    phone: '(801) 555-0100',
    textConsent: true,
  }, context);
  assert.equal(good.ok, true);
  assert.equal(good.value.familyName, 'Patel');
  assert.equal(good.value.email, 'anita@example.com');
  assert.equal(good.value.phone, '+18015550100');

  assert.equal(logic.validateSignup({
    saturday: '2026-11-21',
    familyName: 'nguyen',
    contactName: 'Minh',
    remindBy: 'Email',
    email: 'minh@example.com',
  }, context).error, 'That family is already signed up for this Saturday.');

  const full = logic.validateSignup({
    saturday: '2026-11-21',
    familyName: 'Garcia',
    contactName: 'Rosa Garcia',
    remindBy: 'Email',
    email: 'rosa@example.com',
  }, { ...context, saturday: { ...context.saturday, count: 4 } });
  assert.match(full.error, /already has 4 families/);

  assert.match(logic.validateSignup({
    saturday: '2026-11-21',
    familyName: 'Garcia',
    contactName: 'Rosa',
    remindBy: 'Text',
    phone: '555',
  }, context).error, /area code/);

  assert.match(logic.validateSignup({
    saturday: '2026-11-21',
    familyName: 'Garcia',
    contactName: 'Rosa',
    remindBy: 'Text',
    phone: '(801) 555-0100',
  }, context).error, /agree to receive/);

  assert.match(logic.validateSignup({
    saturday: '2026-11-21',
    familyName: 'Garcia',
    contactName: 'Rosa',
    remindBy: 'Email',
    email: 'not-an-email',
  }, context).error, /you@example.com/);

  assert.match(logic.validateSignup({
    saturday: '2026-11-21',
    familyName: 'Garcia',
    contactName: 'Rosa',
    remindBy: 'Email',
    email: 'rosa@example.com',
  }, { ...context, todayIso: '2026-11-21' }).error, /no longer open/);
});

test('signup help line uses the coordinator name and no contact details', () => {
  assert.equal(
    logic.signupHelpLine(''),
    'Need help signing up? Contact the cleaning coordinator. Their contact information is in the LDS Tools app.'
  );
  assert.equal(
    logic.signupHelpLine('   '),
    'Need help signing up? Contact the cleaning coordinator. Their contact information is in the LDS Tools app.'
  );
  assert.equal(
    logic.signupHelpLine('  Don Winegar  '),
    'Need help signing up? Contact Don Winegar. His contact information is in the LDS Tools app.'
  );
  assert.equal(logic.signupHelpLine('Don Winegar').includes('the cleaning coordinator'), false);
  assert.equal(logic.signupHelpLine('Don Winegar').includes('@'), false);
});

test('sheet text neutralizes formula-looking names', () => {
  assert.equal(logic.asSheetText('=CMD()'), "'=CMD()");
  assert.equal(logic.asSheetText('Patel'), 'Patel');
});

test('friday outcomes retry a failed email and do not resend after a failed text', () => {
  assert.deepEqual(logic.reminderOutcome({
    wantsEmail: true,
    emailSent: false,
    wantsText: false,
    textingEnabled: false,
    textSent: false,
  }), { stamp: false, note: 'email-failed' });

  assert.deepEqual(logic.reminderOutcome({
    wantsEmail: true,
    emailSent: true,
    wantsText: true,
    textingEnabled: true,
    textSent: false,
  }), { stamp: true, note: 'text-failed' });

  assert.deepEqual(logic.reminderOutcome({
    wantsEmail: false,
    emailSent: false,
    wantsText: true,
    textingEnabled: false,
    textSent: false,
  }), { stamp: true, note: 'text-off' });

  assert.equal(logic.reminderOutcome({
    wantsEmail: true,
    emailSent: true,
    wantsText: false,
    textingEnabled: false,
    textSent: false,
  }).note, '');
});

test('low-signup copy states the count without a church name', () => {
  assert.equal(logic.lowSignupSubject(0), 'Saturday cleaning has no families signed up');
  assert.match(logic.lowSignupBody({
    saturdayLabel: 'Saturday, November 21, 2026',
    count: 1,
    max: 4,
    minimum: 2,
    families: ['Patel — Anita Patel'],
    signupUrl: 'https://example.com/signup',
    sheetUrl: 'https://example.com/sheet',
  }), /1 of 4 families/);
  assert.equal(logic.formatLongDate('2026-11-21'), 'Saturday, November 21, 2026');
  assert.match(logic.reminderBody({
    familyName: 'Patel',
    contactName: 'Anita Patel',
    saturdayLabel: 'Saturday, November 21, 2026',
  }), /Supplies are at the building/);
});
