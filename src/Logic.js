/**
 * Pure rules for the Saturday cleaning signup.
 * Apps Script loads this file as a script. Node tests load it as a module.
 */

var TIME_ZONE = 'America/Denver';
var REMIND_EMAIL = 'Email';
var REMIND_TEXT = 'Text';
var REMIND_BOTH = 'Both';
var STATUS_OPEN = 'Open';
var STATUS_CLOSED = 'Closed';
var SHEET_SATURDAYS = 'Saturdays';
var SHEET_SIGNUPS = 'Signups';
var SHEET_SETTINGS = 'Settings';

var SATURDAY_HEADERS = ['Date', 'Status', 'Max families', 'Notes', 'Low-signup notice sent'];
var SIGNUP_HEADERS = ['Saturday', 'Family name', 'Contact name', 'Email', 'Phone', 'Remind by', 'Signed up at', 'Reminder sent at'];

var SETTINGS_DEFAULTS = [
  ['Timezone', TIME_ZONE],
  ['Coordinator name', ''],
  ['Coordinator email', ''],
  ['Minimum families', '2'],
  ['Max families', '4'],
  ['Weeks ahead', '16'],
  ['Texting enabled', 'FALSE'],
];

var SETTING_NOTES = {
  'Timezone': 'Mountain Time. Leave this as America/Denver so reminders follow daylight saving.',
  'Coordinator name': 'Shown on the signup page for people who need help. Leave blank to say "the cleaning coordinator." Do not put a phone number or email here. Those stay in the LDS Tools app.',
  'Coordinator email': 'Gets the Thursday note when fewer than the minimum families are signed up. Reminder replies go here too.',
  'Minimum families': 'On Thursday, email the coordinator when the coming Saturday is below this number.',
  'Max families': 'Default cap used when new Saturdays are added. Change one Saturday in its own Max families cell.',
  'Weeks ahead': 'How many new Saturdays to keep on the schedule.',
  'Texting enabled': 'Leave FALSE until a texting number is registered. Then set TRUE.',
};

function parseIsoDate(iso) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function formatIsoDate(date) {
  var month = String(date.getUTCMonth() + 1);
  var day = String(date.getUTCDate());
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  return date.getUTCFullYear() + '-' + month + '-' + day;
}

function addDays(date, days) {
  var next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function shiftIso(iso, days) {
  var date = parseIsoDate(iso);
  if (!date) return '';
  return formatIsoDate(addDays(date, days));
}

function isSaturday(iso) {
  var date = parseIsoDate(iso);
  return !!date && date.getUTCDay() === 6;
}

function positiveInt(value, fallback, max) {
  var limit = max || 100;
  if (value === '' || value === null || value === undefined) return fallback;
  var number = Number(String(value).trim());
  if (!Number.isInteger(number) || number < 1 || number > limit) return fallback;
  return number;
}

function canonicalizeIso(value) {
  var text = String(value || '').trim().slice(0, 10);
  return parseIsoDate(text) ? text : '';
}

/**
 * The next `weeksAhead` Saturdays after today.
 * A Saturday that is today is skipped, because morning cleaning has started.
 */
function upcomingSaturdayIsos(todayIso, weeksAhead) {
  var today = parseIsoDate(todayIso);
  if (!today) return [];
  var count = positiveInt(weeksAhead, 16, 52);
  var day = today.getUTCDay();
  var delta = (6 - day + 7) % 7;
  if (delta === 0) delta = 7;
  var cursor = addDays(today, delta);
  var dates = [];
  for (var i = 0; i < count; i++) {
    dates.push(formatIsoDate(cursor));
    cursor = addDays(cursor, 7);
  }
  return dates;
}

/**
 * Add Saturdays that are not on the sheet yet.
 * Once a date exists, deleting that row keeps it off the list.
 * Set Status to Closed instead of deleting a row.
 * New dates are only appended after the latest date already on the sheet.
 */
function datesToAdd(todayIso, existingIsos, weeksAhead) {
  var horizon = upcomingSaturdayIsos(todayIso, weeksAhead);
  var existing = [];
  (existingIsos || []).forEach(function (value) {
    var iso = canonicalizeIso(value);
    if (iso) existing.push(iso);
  });
  if (!existing.length) return horizon;
  var latest = existing.reduce(function (left, right) {
    return left > right ? left : right;
  });
  return horizon.filter(function (iso) {
    return iso > latest;
  });
}

/**
 * Saturday the coordinator email is about.
 * Thursday covers the Saturday two days out. Friday covers tomorrow.
 * Any other weekday returns an empty string.
 */
function imminentSaturday(todayIso) {
  var today = parseIsoDate(todayIso);
  if (!today) return '';
  var day = today.getUTCDay();
  if (day === 4) return formatIsoDate(addDays(today, 2));
  if (day === 5) return formatIsoDate(addDays(today, 1));
  return '';
}

function shouldNotifyLowSignup(state) {
  var target = imminentSaturday(state.todayIso);
  if (!target || target !== state.saturdayIso) return false;
  if (state.status !== STATUS_OPEN) return false;
  if (state.alreadySent) return false;
  var count = Number(state.count) || 0;
  var minimum = positiveInt(state.minimum, 2);
  var max = positiveInt(state.max, 4);
  if (count >= minimum || count >= max) return false;
  return true;
}

function spotsLeft(maxFamilies, signupCount) {
  var max = positiveInt(maxFamilies, 4);
  var count = Number(signupCount) || 0;
  var left = max - count;
  return left > 0 ? left : 0;
}

function formatLongDate(iso) {
  var date = parseIsoDate(iso);
  if (!date) return '';
  var weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return weekdays[date.getUTCDay()] + ', ' + months[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + date.getUTCFullYear();
}

function formatShortDate(iso) {
  var date = parseIsoDate(iso);
  if (!date) return '';
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getUTCMonth()] + ' ' + date.getUTCDate();
}

function describeSaturday(row, count) {
  var max = positiveInt(row.max, 4);
  var taken = Number(count) || 0;
  var left = spotsLeft(max, taken);
  var longLabel = formatLongDate(row.date);
  return {
    date: row.date,
    label: longLabel,
    shortLabel: formatShortDate(row.date),
    notes: String(row.notes || '').trim(),
    max: max,
    count: taken,
    spotsLeft: left,
    full: left === 0,
    optionLabel: left === 0 ? longLabel + ' — full' : longLabel + ' — ' + left + ' of ' + max + ' spots left',
  };
}

function normalizeStatus(value) {
  var text = String(value || '').trim().toLowerCase();
  if (text === 'open') return STATUS_OPEN;
  if (text === 'closed') return STATUS_CLOSED;
  return '';
}

function noticeAlreadySent(value) {
  if (value instanceof Date) return !isNaN(value.getTime());
  return String(value || '').trim() !== '';
}

function isValidEmail(email) {
  var text = String(email || '').trim();
  if (!text || text.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * United States numbers become +1. Numbers that already include a country code stay that way.
 */
function normalizePhone(raw) {
  var trimmed = String(raw || '').trim();
  var digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.charAt(0) === '1') return '+' + digits;
  if (trimmed.charAt(0) === '+' && digits.length >= 10 && digits.length <= 15) return '+' + digits;
  return '';
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function badName(name) {
  return !name || name.length > 80 || /[\u0000-\u001F]/.test(name);
}

function sameFamily(left, right) {
  return cleanName(left).toLowerCase() === cleanName(right).toLowerCase();
}

function asSheetText(value) {
  var text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function validateSignup(input, context) {
  var form = input || {};
  if (String(form.honeypot || '').trim()) {
    return { ok: false, error: 'That signup could not be saved. Try again.' };
  }

  var familyName = cleanName(form.familyName);
  var contactName = cleanName(form.contactName);
  if (badName(familyName)) {
    return { ok: false, error: 'Enter a family name of 80 characters or fewer.' };
  }
  if (badName(contactName)) {
    return { ok: false, error: 'Enter a contact name of 80 characters or fewer.' };
  }

  var remindBy = String(form.remindBy || '').trim();
  if (remindBy !== REMIND_EMAIL && remindBy !== REMIND_TEXT && remindBy !== REMIND_BOTH) {
    return { ok: false, error: 'Choose email, text, or both for the Friday reminder.' };
  }

  var email = '';
  var phone = '';
  if (remindBy === REMIND_EMAIL || remindBy === REMIND_BOTH) {
    email = normalizeEmail(form.email);
    if (!isValidEmail(email)) {
      return { ok: false, error: 'Enter an email address in the format you@example.com.' };
    }
  }
  if (remindBy === REMIND_TEXT || remindBy === REMIND_BOTH) {
    phone = normalizePhone(form.phone);
    if (!phone) {
      return { ok: false, error: 'Enter a phone number with an area code, such as 801-555-0100.' };
    }
  }

  var saturdayIso = canonicalizeIso(form.saturday);
  var saturday = context && context.saturday;
  if (!isSaturday(saturdayIso) || !saturday || saturday.date !== saturdayIso) {
    return { ok: false, error: 'Choose an open Saturday.' };
  }
  if (!context.todayIso || saturdayIso <= context.todayIso) {
    return { ok: false, error: 'That Saturday is no longer open for signup.' };
  }
  if (saturday.status !== STATUS_OPEN) {
    return { ok: false, error: 'That Saturday is closed.' };
  }

  var max = positiveInt(saturday.max, 4);
  var count = Number(saturday.count) || 0;
  if (count >= max) {
    return { ok: false, error: 'That Saturday already has ' + max + ' families. Choose another date.' };
  }

  var names = (context && context.existingFamilyNames) || [];
  for (var i = 0; i < names.length; i++) {
    if (sameFamily(names[i], familyName)) {
      return { ok: false, error: 'That family is already signed up for this Saturday.' };
    }
  }

  return {
    ok: true,
    value: {
      saturday: saturdayIso,
      familyName: familyName,
      contactName: contactName,
      email: email,
      phone: phone,
      remindBy: remindBy,
    },
  };
}

function lowSignupSubject(count) {
  var number = Number(count) || 0;
  if (number === 0) return 'Saturday cleaning has no families signed up';
  if (number === 1) return 'Saturday cleaning needs more families — 1 signed up';
  return 'Saturday cleaning needs more families — ' + number + ' signed up';
}

function lowSignupBody(details) {
  var lines = [
    details.saturdayLabel + ' has ' + details.count + ' of ' + details.max + ' families signed up. The minimum is ' + details.minimum + '.',
    '',
  ];
  var families = details.families || [];
  if (families.length) {
    lines.push('Signed up:');
    families.forEach(function (name) {
      lines.push('- ' + name);
    });
    lines.push('');
  } else {
    lines.push('Nobody is signed up yet.');
    lines.push('');
  }
  lines.push('Contact details are on the Signups tab.');
  if (details.sheetUrl) {
    lines.push(details.sheetUrl);
    lines.push('');
  }
  if (details.signupUrl) {
    lines.push('Signup page:');
    lines.push(details.signupUrl);
  }
  return lines.join('\n');
}

function reminderSubject() {
  return 'Reminder: Saturday morning cleaning is tomorrow';
}

function reminderBody(details) {
  var who = details.contactName
    ? details.familyName + ' (' + details.contactName + ')'
    : details.familyName;
  return [
    who + ' is signed up for Saturday morning cleaning on ' + details.saturdayLabel + '.',
    '',
    'Supplies are at the building.',
    'Reply to this email if you need to cancel.',
  ].join('\n');
}

function smsBody(details) {
  return 'Reminder: ' + details.familyName + ' is signed up for Saturday morning cleaning on ' + details.saturdayLabel + '. Reply to the coordinator to cancel.';
}

function reminderChannels(remindBy) {
  return {
    wantsEmail: remindBy === REMIND_EMAIL || remindBy === REMIND_BOTH,
    wantsText: remindBy === REMIND_TEXT || remindBy === REMIND_BOTH,
  };
}

/**
 * Decide whether the Friday job should mark the row done, and whether the
 * coordinator needs a follow-up. Email failure stays unmarked so a second run
 * can retry. A text failure is marked after the email went out, so a retry
 * does not send the email again. The coordinator follow-up covers the text.
 */
function reminderOutcome(state) {
  var emailOk = !state.wantsEmail || state.emailSent;
  var textAttemptFailed = state.wantsText && state.textingEnabled && !state.textSent;
  if (!emailOk) return { stamp: false, note: 'email-failed' };
  if (textAttemptFailed) return { stamp: true, note: 'text-failed' };
  if (state.wantsText && !state.textingEnabled) return { stamp: true, note: 'text-off' };
  return { stamp: true, note: '' };
}

function followupReason(note) {
  if (note === 'email-failed') return 'The email reminder could not be sent.';
  if (note === 'text-failed') return 'The text reminder could not be sent.';
  if (note === 'text-off') return 'They asked for a text, and texting is turned off.';
  return '';
}

function signupHelpLine(name) {
  var cleaned = cleanName(name);
  if (!cleaned) {
    return 'Need help signing up? Contact the cleaning coordinator. Their contact information is in the LDS Tools app.';
  }
  return 'Need help signing up? Contact ' + cleaned + '. His contact information is in the LDS Tools app.';
}

function followupBody(items, saturdayLabel) {
  var lines = [
    'Friday reminders for ' + saturdayLabel + ' need a follow-up.',
    '',
  ];
  (items || []).forEach(function (item) {
    var reason = followupReason(item.note);
    if (!reason) return;
    lines.push(item.familyName + (item.contactName ? ' — ' + item.contactName : ''));
    lines.push(reason);
    if (item.email) lines.push('Email: ' + item.email);
    if (item.phone) lines.push('Phone: ' + item.phone);
    lines.push('');
  });
  return lines.join('\n').trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIME_ZONE: TIME_ZONE,
    REMIND_EMAIL: REMIND_EMAIL,
    REMIND_TEXT: REMIND_TEXT,
    REMIND_BOTH: REMIND_BOTH,
    STATUS_OPEN: STATUS_OPEN,
    STATUS_CLOSED: STATUS_CLOSED,
    SATURDAY_HEADERS: SATURDAY_HEADERS,
    SIGNUP_HEADERS: SIGNUP_HEADERS,
    SETTINGS_DEFAULTS: SETTINGS_DEFAULTS,
    parseIsoDate: parseIsoDate,
    formatIsoDate: formatIsoDate,
    shiftIso: shiftIso,
    isSaturday: isSaturday,
    positiveInt: positiveInt,
    upcomingSaturdayIsos: upcomingSaturdayIsos,
    datesToAdd: datesToAdd,
    imminentSaturday: imminentSaturday,
    shouldNotifyLowSignup: shouldNotifyLowSignup,
    spotsLeft: spotsLeft,
    formatLongDate: formatLongDate,
    describeSaturday: describeSaturday,
    normalizeStatus: normalizeStatus,
    noticeAlreadySent: noticeAlreadySent,
    isValidEmail: isValidEmail,
    normalizePhone: normalizePhone,
    asSheetText: asSheetText,
    validateSignup: validateSignup,
    lowSignupSubject: lowSignupSubject,
    lowSignupBody: lowSignupBody,
    reminderSubject: reminderSubject,
    reminderBody: reminderBody,
    smsBody: smsBody,
    reminderChannels: reminderChannels,
    reminderOutcome: reminderOutcome,
    signupHelpLine: signupHelpLine,
    followupBody: followupBody,
  };
}
