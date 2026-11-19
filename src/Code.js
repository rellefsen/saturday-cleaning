/**
 * Saturday cleaning signup.
 *
 * Bound to the coordinator's Google Sheet. Families use the web app embedded
 * on the church Google Site. The sheet stays private.
 *
 * One-time setup from the sheet menu: Cleaning → Set up sheet, then
 * Cleaning → Install reminder schedule. Deploy the web app as
 * "Execute as me" and "Anyone".
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Cleaning')
    .addItem('Set up sheet', 'setup')
    .addItem('Install reminder schedule', 'installTriggers')
    .addItem('Add upcoming Saturdays', 'ensureUpcomingSaturdays')
    .addSeparator()
    .addItem('Check low signup now', 'checkLowSignupFromMenu')
    .addItem('Send Friday reminders now', 'sendFridayReminders')
    .addToUi();
}

function setup() {
  var ss = spreadsheet_();
  ss.setSpreadsheetTimeZone(TIME_ZONE);
  ensureSheets_();
  applySheetLayout_();
  ensureUpcomingSaturdaysUnlocked_();
  toast_('Sheet is ready. Add the coordinator email on the Settings tab, then install the reminder schedule.');
}

function installTriggers() {
  var handlers = {
    notifyCoordinatorIfShort: true,
    sendFridayReminders: true,
    ensureUpcomingSaturdays: true,
  };
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlers[trigger.getHandlerFunction()]) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('notifyCoordinatorIfShort')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(9)
    .create();
  ScriptApp.newTrigger('sendFridayReminders')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(9)
    .create();
  ScriptApp.newTrigger('ensureUpcomingSaturdays')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  toast_('Reminders are scheduled for around 9:00am Mountain Time. Thursday emails the coordinator when fewer than 2 families are signed up. Friday reminds the families.');
}

function doGet() {
  return withLock_(function () {
    ensureSheets_();
    ensureUpcomingSaturdaysUnlocked_();
    var template = HtmlService.createTemplateFromFile('Index');
    template.pageData = safeJson_(buildPageData_());
    return template.evaluate()
      .setTitle('Saturday cleaning signup')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  });
}

function getPageData() {
  return withLock_(function () {
    ensureSheets_();
    ensureUpcomingSaturdaysUnlocked_();
    return buildPageData_();
  });
}

function submitSignup(form) {
  try {
    return withLock_(function () {
      ensureSheets_();
      ensureUpcomingSaturdaysUnlocked_();
      var saturdayIso = canonicalizeIso(form && form.saturday);
      var row = readSaturday_(saturdayIso);
      var result = validateSignup(form, {
        todayIso: todayIso_(),
        saturday: row,
        existingFamilyNames: familyNamesFor_(saturdayIso),
      });
      if (!result.ok) return result;
      appendSignup_(result.value);
      var saved = readSaturday_(result.value.saturday);
      var count = countSignups_(result.value.saturday);
      return {
        ok: true,
        saturday: result.value.saturday,
        saturdayLabel: formatLongDate(result.value.saturday),
        familyName: result.value.familyName,
        spotsLeft: spotsLeft(saved ? saved.max : 4, count),
        max: saved ? saved.max : 4,
      };
    });
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Something went wrong saving the signup. Try again in a moment.' };
  }
}

function ensureUpcomingSaturdays() {
  withLock_(function () {
    ensureSheets_();
    ensureUpcomingSaturdaysUnlocked_();
  });
}

function notifyCoordinatorIfShort() {
  ensureUpcomingSaturdays();
  var plan = planLowSignup_();
  if (!plan.send) return plan;
  MailApp.sendEmail({
    to: plan.to,
    subject: plan.subject,
    body: plan.body,
  });
  withLock_(function () {
    stampLowNotice_(plan.saturdayIso);
  });
  return { sent: true, saturdayIso: plan.saturdayIso };
}

function checkLowSignupFromMenu() {
  var today = todayIso_();
  if (!imminentSaturday(today)) {
    toast_('The low-signup email sends on Thursday and Friday for the coming Saturday. Today is not one of those days.');
    return;
  }
  var result = notifyCoordinatorIfShort();
  if (result && result.sent) {
    toast_('Coordinator email sent for ' + formatLongDate(result.saturdayIso) + '.');
    return;
  }
  toast_('No coordinator email was sent. The coming Saturday may already have enough families, be closed, or already have a notice.');
}

function sendFridayReminders() {
  ensureUpcomingSaturdays();
  try {
    notifyCoordinatorIfShort();
  } catch (error) {
    console.error(error);
  }

  var tomorrow = shiftIso(todayIso_(), 1);
  if (!isSaturday(tomorrow)) return { sent: 0, reason: 'tomorrow-is-not-saturday' };

  var settings = readSettings_();
  var pending = readPendingReminders_(tomorrow);
  var followups = [];
  var sent = 0;

  pending.forEach(function (signup) {
    var channels = reminderChannels(signup.remindBy);
    var emailSent = !channels.wantsEmail;
    var textSent = !channels.wantsText || !settings.textingEnabled;
    try {
      if (channels.wantsEmail) {
        sendReminderEmail_(signup, settings, tomorrow);
        emailSent = true;
      }
    } catch (error) {
      emailSent = false;
      console.error(error);
    }
    try {
      if (channels.wantsText && settings.textingEnabled) {
        sendSms_(signup.phone, smsBody({
          familyName: signup.familyName,
          saturdayLabel: formatShortDate(tomorrow),
        }));
        textSent = true;
      }
    } catch (error) {
      textSent = false;
      console.error(error);
    }

    var outcome = reminderOutcome({
      wantsEmail: channels.wantsEmail,
      emailSent: emailSent,
      wantsText: channels.wantsText,
      textingEnabled: settings.textingEnabled,
      textSent: textSent,
    });
    if (outcome.stamp) {
      stampReminder_(signup.row);
      sent++;
    }
    if (outcome.note) {
      followups.push({
        familyName: signup.familyName,
        contactName: signup.contactName,
        email: signup.email,
        phone: signup.phone,
        note: outcome.note,
      });
    }
  });

  if (followups.length && isValidEmail(settings.coordinatorEmail)) {
    MailApp.sendEmail({
      to: settings.coordinatorEmail,
      subject: 'Saturday cleaning reminders need a follow-up',
      body: followupBody(followups, formatLongDate(tomorrow)),
    });
  }

  return { sent: sent, followups: followups.length };
}

function buildPageData_() {
  var settings = readSettings_();
  var today = todayIso_();
  var described = [];
  readSaturdays_().forEach(function (row) {
    if (row.status !== STATUS_OPEN) return;
    if (!row.date || row.date <= today) return;
    described.push(describeSaturday(row, countSignups_(row.date)));
  });
  described.sort(function (left, right) {
    return left.date < right.date ? -1 : left.date > right.date ? 1 : 0;
  });
  return {
    textingEnabled: settings.textingEnabled,
    coordinatorName: settings.coordinatorName,
    helpText: signupHelpLine(settings.coordinatorName),
    saturdays: described,
  };
}

function planLowSignup_() {
  var today = todayIso_();
  var target = imminentSaturday(today);
  if (!target) return { send: false, reason: 'not-thursday-or-friday' };
  var saturday = readSaturday_(target);
  var settings = readSettings_();
  var count = countSignups_(target);
  var send = saturday && shouldNotifyLowSignup({
    todayIso: today,
    saturdayIso: target,
    status: saturday.status,
    count: count,
    minimum: settings.minimumFamilies,
    max: saturday.max,
    alreadySent: saturday.lowNoticeSent,
  });
  if (!send) return { send: false, reason: 'not-needed', saturdayIso: target };
  if (!isValidEmail(settings.coordinatorEmail)) {
    console.error('Coordinator email is missing. Set it on the Settings tab.');
    return { send: false, reason: 'missing-coordinator-email', saturdayIso: target };
  }
  var names = readSignupRecords_().filter(function (record) {
    return record.saturday === target;
  }).map(function (record) {
    return record.contactName ? record.familyName + ' — ' + record.contactName : record.familyName;
  });
  return {
    send: true,
    to: settings.coordinatorEmail,
    saturdayIso: target,
    subject: lowSignupSubject(count),
    body: lowSignupBody({
      saturdayLabel: formatLongDate(target),
      count: count,
      minimum: settings.minimumFamilies,
      max: saturday.max,
      families: names,
      sheetUrl: spreadsheet_().getUrl(),
      signupUrl: webAppUrl_(),
    }),
  };
}

function ensureSheets_() {
  var ss = spreadsheet_();
  getOrCreateSheet_(ss, SHEET_SATURDAYS, SATURDAY_HEADERS);
  getOrCreateSheet_(ss, SHEET_SIGNUPS, SIGNUP_HEADERS);
  var settings = getOrCreateSheet_(ss, SHEET_SETTINGS, ['Setting', 'Value']);
  seedSettings_(settings);
}

function ensureUpcomingSaturdaysUnlocked_() {
  var settings = readSettings_();
  var sheet = sheet_(SHEET_SATURDAYS);
  var existing = readSaturdays_().map(function (row) { return row.date; });
  var missing = datesToAdd(todayIso_(), existing, settings.weeksAhead);
  if (!missing.length) return;
  var start = Math.max(sheet.getLastRow() + 1, 2);
  var rows = missing.map(function (iso) {
    return [isoToSheetDate_(iso), STATUS_OPEN, settings.maxFamilies, '', ''];
  });
  sheet.getRange(start, 1, rows.length, SATURDAY_HEADERS.length).setValues(rows);
  sheet.getRange(start, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
}

function applySheetLayout_() {
  var saturdays = sheet_(SHEET_SATURDAYS);
  var signups = sheet_(SHEET_SIGNUPS);
  var settings = sheet_(SHEET_SETTINGS);
  [saturdays, signups, settings].forEach(function (sheet) {
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  });

  var openClosed = SpreadsheetApp.newDataValidation()
    .requireValueInList([STATUS_OPEN, STATUS_CLOSED], true)
    .setAllowInvalid(false)
    .build();
  saturdays.getRange(2, 2, 500, 1).setDataValidation(openClosed);
  saturdays.getRange(2, 1, 500, 1).setNumberFormat('yyyy-mm-dd');
  saturdays.setColumnWidth(1, 130);
  saturdays.setColumnWidth(4, 280);

  var remind = SpreadsheetApp.newDataValidation()
    .requireValueInList([REMIND_EMAIL, REMIND_TEXT, REMIND_BOTH], true)
    .setAllowInvalid(false)
    .build();
  signups.getRange(2, 6, 1000, 1).setDataValidation(remind);
  signups.getRange(2, 1, 1000, 1).setNumberFormat('yyyy-mm-dd');
  signups.setColumnWidth(2, 180);
  signups.setColumnWidth(3, 180);

  var texting = SpreadsheetApp.newDataValidation()
    .requireValueInList(['TRUE', 'FALSE'], true)
    .setAllowInvalid(true)
    .build();
  var settingValues = settings.getRange(2, 1, Math.max(settings.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < settingValues.length; i++) {
    var name = String(settingValues[i][0] || '');
    if (SETTING_NOTES[name]) settings.getRange(i + 2, 1).setNote(SETTING_NOTES[name]);
    if (name === 'Texting enabled') settings.getRange(i + 2, 2).setDataValidation(texting);
  }
}

function seedSettings_(sheet) {
  var map = headerMap_(sheet);
  var nameCol = map.Setting;
  var valueCol = map.Value;
  if (nameCol === undefined || valueCol === undefined) return;
  var last = sheet.getLastRow();
  var present = {};
  if (last >= 2) {
    sheet.getRange(2, nameCol + 1, last - 1, 1).getValues().forEach(function (row) {
      present[String(row[0]).trim()] = true;
    });
  }
  SETTINGS_DEFAULTS.forEach(function (pair) {
    if (present[pair[0]]) return;
    sheet.appendRow([pair[0], pair[1]]);
    if (SETTING_NOTES[pair[0]]) {
      sheet.getRange(sheet.getLastRow(), 1).setNote(SETTING_NOTES[pair[0]]);
    }
  });
}

function readSettings_() {
  var sheet = sheet_(SHEET_SETTINGS);
  var values = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    map[String(values[i][0]).trim()] = values[i][1];
  }
  return {
    timezone: String(map.Timezone || TIME_ZONE).trim() || TIME_ZONE,
    coordinatorName: cleanName(map['Coordinator name']),
    coordinatorEmail: normalizeEmail(map['Coordinator email']),
    minimumFamilies: positiveInt(map['Minimum families'], 2),
    maxFamilies: positiveInt(map['Max families'], 4),
    weeksAhead: positiveInt(map['Weeks ahead'], 16, 52),
    textingEnabled: /^true$/i.test(String(map['Texting enabled'] || '').trim()),
  };
}

function readSaturdays_() {
  return readObjects_(SHEET_SATURDAYS).map(function (entry) {
    return {
      row: entry.row,
      date: cellToIso_(entry.values.Date),
      status: normalizeStatus(entry.values.Status),
      max: positiveInt(entry.values['Max families'], 4),
      notes: String(entry.values.Notes || '').trim(),
      lowNoticeSent: noticeAlreadySent(entry.values['Low-signup notice sent']),
    };
  }).filter(function (row) {
    return row.date;
  });
}

function readSaturday_(iso) {
  var found = null;
  readSaturdays_().forEach(function (row) {
    if (row.date === iso) found = row;
  });
  return found;
}

function readSignupRecords_() {
  return readObjects_(SHEET_SIGNUPS).map(function (entry) {
    return {
      row: entry.row,
      saturday: cellToIso_(entry.values.Saturday),
      familyName: String(entry.values['Family name'] || '').trim(),
      contactName: String(entry.values['Contact name'] || '').trim(),
      email: String(entry.values.Email || '').trim(),
      phone: String(entry.values.Phone || '').trim(),
      remindBy: String(entry.values['Remind by'] || '').trim(),
      reminderSent: entry.values['Reminder sent at'],
    };
  }).filter(function (row) {
    return row.saturday && row.familyName;
  });
}

function familyNamesFor_(iso) {
  return readSignupRecords_().filter(function (record) {
    return record.saturday === iso;
  }).map(function (record) {
    return record.familyName;
  });
}

function countSignups_(iso) {
  return familyNamesFor_(iso).length;
}

function readPendingReminders_(iso) {
  return readSignupRecords_().filter(function (record) {
    return record.saturday === iso && !noticeAlreadySent(record.reminderSent);
  });
}

function appendSignup_(value) {
  var sheet = sheet_(SHEET_SIGNUPS);
  sheet.appendRow([
    isoToSheetDate_(value.saturday),
    asSheetText(value.familyName),
    asSheetText(value.contactName),
    asSheetText(value.email),
    asSheetText(value.phone),
    value.remindBy,
    new Date(),
    '',
  ]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('yyyy-mm-dd');
}

function stampLowNotice_(iso) {
  var saturday = readSaturday_(iso);
  if (!saturday) return;
  writeCell_(SHEET_SATURDAYS, saturday.row, 'Low-signup notice sent', new Date());
}

function stampReminder_(row) {
  writeCell_(SHEET_SIGNUPS, row, 'Reminder sent at', new Date());
}

function sendReminderEmail_(signup, settings, saturdayIso) {
  var message = {
    to: signup.email,
    subject: reminderSubject(),
    body: reminderBody({
      familyName: signup.familyName,
      contactName: signup.contactName,
      saturdayLabel: formatLongDate(saturdayIso),
    }),
  };
  if (isValidEmail(settings.coordinatorEmail)) message.replyTo = settings.coordinatorEmail;
  MailApp.sendEmail(message);
}

function sendSms_(to, body) {
  var props = PropertiesService.getScriptProperties();
  var sid = props.getProperty('TWILIO_ACCOUNT_SID');
  var token = props.getProperty('TWILIO_AUTH_TOKEN');
  var from = props.getProperty('TWILIO_FROM_NUMBER');
  if (!sid || !token || !from) {
    throw new Error('Texting properties are missing. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.');
  }
  var response = UrlFetchApp.fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json',
    {
      method: 'post',
      payload: { To: to, From: from, Body: body },
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + token) },
      muteHttpExceptions: true,
    }
  );
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Text failed with status ' + code + '.');
  }
}

function readObjects_(sheetName) {
  var sheet = sheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  return values.map(function (row, index) {
    var record = {};
    headers.forEach(function (header, column) {
      record[String(header).trim()] = row[column];
    });
    return { row: index + 2, values: record };
  });
}

function writeCell_(sheetName, row, header, value) {
  var sheet = sheet_(sheetName);
  var map = headerMap_(sheet);
  if (map[header] === undefined) {
    throw new Error('Missing column "' + header + '". Run Cleaning → Set up sheet.');
  }
  sheet.getRange(row, map[header] + 1).setValue(value);
}

function headerMap_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var map = {};
  headers.forEach(function (header, index) {
    var name = String(header).trim();
    if (name && map[name] === undefined) map[name] = index;
  });
  return map;
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    var only = ss.getSheets();
    if (only.length === 1 && only[0].getName() === 'Sheet1' && only[0].getLastRow() === 0 && name === SHEET_SATURDAYS) {
      sheet = only[0];
      sheet.setName(name);
    } else {
      sheet = ss.insertSheet(name);
    }
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function sheet_(name) {
  var found = spreadsheet_().getSheetByName(name);
  if (!found) throw new Error('Missing the ' + name + ' tab. Run Cleaning → Set up sheet.');
  return found;
}

function spreadsheet_() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error('Open the script from the Google Sheet (Extensions → Apps Script) so it stays bound to that file.');
  }
  return ss;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function todayIso_() {
  return Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
}

function cellToIso_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TIME_ZONE, 'yyyy-MM-dd');
  }
  return canonicalizeIso(value);
}

function isoToSheetDate_(iso) {
  var parts = iso.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function safeJson_(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function webAppUrl_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (error) {
    return '';
  }
}

function toast_(message) {
  try {
    spreadsheet_().toast(message, 'Saturday cleaning', 8);
  } catch (error) {
    console.log(message);
  }
}
