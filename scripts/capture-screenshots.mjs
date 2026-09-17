import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const root = process.cwd();
try { process.loadEnvFile(path.join(root, '.env.docs')); } catch {}
const outputRoot = path.join(root, 'images');
const sourceDir = process.env.JOYGROW_SOURCE_DIR?.trim();
const attendanceSourceDir = process.env.ATTENDANCE_SOURCE_DIR?.trim();
const localPort = Number(process.env.JOYGROW_PORT || 3117);
const attendancePort = Number(process.env.ATTENDANCE_PORT || 4187);
const joygrowBaseUrl = (process.env.JOYGROW_BASE_URL || (sourceDir ? `http://127.0.0.1:${localPort}` : 'https://songrim-point.netlify.app')).replace(/\/$/, '');
const attendanceBaseUrl = (process.env.ATTENDANCE_BASE_URL || (attendanceSourceDir ? `http://127.0.0.1:${attendancePort}` : 'https://songrim-attendance.netlify.app')).replace(/\/$/, '');
const manifest = { generatedAt: new Date().toISOString(), joygrowBaseUrl, attendanceBaseUrl, captured: [], skipped: [] };
let server;
let attendanceServer;

async function waitForUrl(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error(`서버가 준비되지 않았습니다: ${url}`);
}

async function startLocalJoyGrow() {
  if (!sourceDir || process.env.JOYGROW_BASE_URL) return;
  const nextCli = path.join(sourceDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  server = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', String(localPort)], {
    cwd: sourceDir,
    env: { ...process.env, NODE_ENV: 'development' },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => process.stdout.write(`[joygrow] ${chunk}`));
  server.stderr.on('data', (chunk) => process.stderr.write(`[joygrow] ${chunk}`));
  await waitForUrl(`${joygrowBaseUrl}/student/login`);
}

async function startLocalAttendance() {
  if (!attendanceSourceDir || process.env.ATTENDANCE_BASE_URL) return;
  const viteCli = path.join(attendanceSourceDir, 'node_modules', 'vite', 'bin', 'vite.js');
  attendanceServer = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(attendancePort), '--strictPort'], {
    cwd: attendanceSourceDir,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://docs-demo.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'docs-demo-anon-key',
      VITE_JOYGROW_API_BASE: joygrowBaseUrl,
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  attendanceServer.stdout.on('data', (chunk) => process.stdout.write(`[attendance] ${chunk}`));
  attendanceServer.stderr.on('data', (chunk) => process.stderr.write(`[attendance] ${chunk}`));
  await waitForUrl(attendanceBaseUrl);
}

const demoStudents = [
  { id: 'student-joy', name: '기쁨이', class_id: 'class-demo', birth: '2015-09-21', school: '송림초', phone: '010-0000-0001', start_date: '2026-01-04', active: true },
  { id: 'student-faith', name: '믿음이', class_id: 'class-demo', birth: '2015-10-02', school: '송림초', phone: '010-0000-0002', start_date: '2026-01-04', active: true },
  { id: 'student-hope', name: '소망이', class_id: 'class-demo', birth: '2015-08-13', school: '분당초', phone: '010-0000-0003', start_date: '2026-01-04', active: true },
  { id: 'student-love', name: '사랑이', class_id: 'class-demo', birth: '2015-09-28', school: '분당초', phone: '010-0000-0004', start_date: '2026-01-04', active: true },
];
const demoClass = { id: 'class-demo', name: '6-1', service: '1부', teacher_name: '데모 선생님' };
for (const student of demoStudents) student.classes = demoClass;
const latestSunday = (() => {
  const date = new Date();
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
})();
const activityDefinitions = [
  ['word_focus', '말씀 집중', 5], ['praise_passion', '찬양 열정', 5], ['friend_help', '친구 도움', 5],
  ['teacher_help', '선생님 도움', 5], ['pretty_words', '예쁜 말', 5], ['chant_complete', '챈트 완료', 10], ['friend_invite', '친구 전도', 20],
].map(([activity_key, teacher_label, point_reward]) => ({ activity_key, teacher_label, point_reward, exp_reward: point_reward * 2, weekly_limit: 1, teacher_grantable: true, is_active: true }));

function demoSession(role) {
  const id = role === 'admin' ? '00000000-0000-4000-8000-000000000002' : role === 'support' ? '00000000-0000-4000-8000-000000000003' : role === 'pending' ? '00000000-0000-4000-8000-000000000004' : '00000000-0000-4000-8000-000000000001';
  const payload = Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const accessToken = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${payload}.docs`;
  const user = { id, aud: 'authenticated', role: 'authenticated', email: `${role}@joygrow-docs.test`, app_metadata: {}, user_metadata: {} };
  return { access_token: accessToken, refresh_token: 'docs-demo-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
}

async function installAttendanceFixtures(context, role = 'teacher') {
  const session = demoSession(role);
  const profile = role === 'admin'
    ? { id: session.user.id, role: 'admin', class_id: null, display_name: '데모 관리자', service_scope: null, approval_status: 'approved' }
    : role === 'support'
      ? { id: session.user.id, role: 'non_class_teacher', class_id: null, display_name: '데모 지원교사', service_scope: '1부', approval_status: 'approved' }
      : role === 'pending'
        ? { id: session.user.id, role: 'sub_admin', class_id: null, display_name: '데모 승인대기', service_scope: '1부', approval_status: 'pending' }
        : { id: session.user.id, role: 'teacher', class_id: 'class-demo', display_name: '데모 선생님', service_scope: '1부', approval_status: 'approved' };
  await context.addInitScript(({ storedSession }) => {
    localStorage.setItem('sb-docs-demo-auth-token', JSON.stringify(storedSession));
  }, { storedSession: session });
  await context.route('https://docs-demo.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const objectResponse = (request.headers().accept || '').includes('application/vnd.pgrst.object+json');
    let body = [];
    if (url.pathname.includes('/auth/v1/user')) body = session.user;
    else if (url.pathname.includes('/auth/v1/token')) body = session;
    else if (url.pathname.includes('/rest/v1/profiles')) body = objectResponse ? profile : [profile, { id: 'teacher-demo', role: 'teacher', display_name: '데모 선생님', class_id: 'class-demo', service_scope: '1부', approval_status: 'approved' }];
    else if (url.pathname.includes('/rest/v1/classes')) body = objectResponse ? demoClass : [demoClass];
    else if (url.pathname.includes('/rest/v1/students')) body = objectResponse ? demoStudents[0] : demoStudents;
    else if (url.pathname.includes('/rest/v1/attendance')) body = demoStudents.map((student, index) => ({ id: `attendance-${index}`, student_id: student.id, class_id: 'class-demo', attendance_date: latestSunday, present: index < 2, reason: index === 2 ? '가족 일정' : index === 3 ? '건강 회복 중' : '', snack: index === 0, snack_tier: index === 0 ? 1 : null, discretion: index === 1 }));
    else if (url.pathname.includes('/rest/v1/duty_schedule')) body = [{ id: 'duty-1', duty_date: latestSunday, service: '1부', duty_type: 'prayer', student_id: 'student-joy', student_name: '기쁨이' }, { id: 'duty-2', duty_date: latestSunday, service: '1부', duty_type: 'offering', student_id: 'student-faith', student_name: '믿음이' }];
    else if (url.pathname.includes('/rest/v1/long_term_absences')) body = [{ id: 'long-1', student_id: 'student-love', start_date: latestSunday, reason: '치료와 회복', detail: '보호자와 연락하며 복귀 일정을 확인합니다.', next_contact_date: latestSunday, active: true, today_checked: false, students: demoStudents[3] }];
    else if (url.pathname.includes('/rest/v1/planned_absences')) body = [{ id: 'plan-1', student_id: 'student-hope', start_date: latestSunday, end_date: latestSunday, reason: '가족 일정', detail: '다음 주 복귀 예정', active: true }];
    else if (url.pathname.includes('/rest/v1/new_family_submissions')) body = [{ id: 'new-1', student_name: '새롬이', birth: '2016-05-05', school: '송림초', service: '1부', status: 'pending', guardian_name: '보호자', guardian_phone: '010-0000-0010', created_at: new Date().toISOString() }];
    else if (url.pathname.includes('/rest/v1/new_family_education_records')) body = [];
    else if (url.pathname.includes('/rest/v1/messages')) body = [{ id: 'message-1', title: '주일 출석 확인 안내', content: '예배 후 결석 사유를 확인해 주세요.', target_class_id: 'class-demo', created_at: new Date().toISOString(), read: false }];
    else if (url.pathname.includes('/rest/v1/sunday_reports')) body = [{ id: 'report-1', report_date: latestSunday, service: '1부', student_count: 2, teacher_count: 1, visitor_count: 1, new_family_count: 1, offering_amount: 30000, notes: '새가족 환영 및 결석 학생 안부 확인' }];
    else if (url.pathname.includes('/rest/v1/deleted_students')) body = [{ id: 'deleted-1', name: '복구예시', deleted_at: new Date().toISOString(), class_name: '6-1', service: '1부' }];
    else if (url.pathname.includes('/rest/v1/app_settings')) body = [{ key: 'google_sheet_url', value: 'https://script.google.com/macros/s/DEMO/exec' }, { key: 'google_sheet_link', value: 'https://docs.google.com/spreadsheets/d/DEMO' }];
    else if (url.pathname.includes('/rest/v1/care_visit_requests')) body = [];
    else if (url.pathname.includes('/rest/v1/pastoral_care_items')) body = [{ id: 'care-1', person_name: '소망이', subject_type: 'student', title: '결석 후 안부 확인', summary: '가족 일정 후 다음 주 복귀 예정', category: 'attendance', status: 'in_progress', follow_up_date: latestSunday, next_action: '담당 교사 연락' }];
    else if (url.pathname.includes('/rest/v1/pastoral_contacts')) body = [];
    else if (url.pathname.includes('/rest/v1/finance_center_settings')) body = objectResponse ? null : [];
    else if (url.pathname.includes('/rest/v1/rpc/check_data_integrity')) body = [{ check_type: 'unassigned_students', severity: 'warning', count: 1, details: [{ name: '확인학생' }] }];
    else if (url.pathname.includes('/rest/v1/rpc/')) body = [];
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-3/4' }, body: JSON.stringify(body) });
  });
  await context.route('**/api/teacher/**', async (route) => {
    const url = new URL(route.request().url());
    const students = demoStudents.map((student, index) => ({ id: student.id, studentName: student.name, service: '1부', classCode: '6-1', points: 35 + index * 10 }));
    const directory = { students, definitions: activityDefinitions, todayAwards: [], weeklyAwards: [], classSizes: { '6-1': 4 }, praiseQuotaPercent: 30, praiseStudentWeeklyLimit: 2 };
    const control = {
      students, definitions: activityDefinitions, events: [{ id: 'event-demo', title: '친구초청 주일', icon: '🔥', activityKey: 'friend_invite', startsOn: '2026-09-01', endsOn: '2026-09-30' }],
      recentAwards: [], recentAdjustments: [], rankings: { classes: [{ rank: 1, classCode: '6-1', value: 42 }], exp: [{ rank: 1, name: '기쁨이', value: 120 }], attendance: [], eomuk: [] },
    };
    const body = url.pathname.endsWith('/control') ? control : directory;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function addCallouts(page, selectors) {
  await page.evaluate((items) => {
    document.querySelectorAll('[data-doc-callout]').forEach((node) => node.remove());
    const style = document.createElement('style');
    style.dataset.docCallout = 'style';
    style.textContent = '[data-doc-callout]{position:fixed;z-index:2147483647;width:34px;height:34px;border-radius:999px;display:grid;place-items:center;background:#4f46e5;color:white;border:3px solid white;box-shadow:0 3px 14px #0005;font:900 18px/1 system-ui}';
    document.head.append(style);
    items.forEach(({ selector, number }) => {
      const target = document.querySelector(selector);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const badge = document.createElement('span');
      badge.dataset.docCallout = String(number);
      badge.textContent = String(number);
      badge.style.left = `${Math.max(4, Math.min(innerWidth - 38, rect.left + 6))}px`;
      badge.style.top = `${Math.max(4, Math.min(innerHeight - 38, rect.top + 6))}px`;
      document.body.append(badge);
    });
  }, selectors);
}

async function clearCallouts(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-doc-callout],style[data-doc-callout]').forEach((node) => node.remove());
  });
}

async function screenshot(page, relativePath, { callouts = [], fullPage = true } = {}) {
  const file = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  if (callouts.length) await addCallouts(page, callouts);
  await page.screenshot({ path: file, fullPage, animations: 'disabled' });
  await clearCallouts(page);
  manifest.captured.push(relativePath.replaceAll('\\', '/'));
}

async function captureStudent(browser) {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  const page = await context.newPage();
  await page.goto(`${joygrowBaseUrl}/student/login`, { waitUntil: 'networkidle' });
  await screenshot(page, 'student/login.png', {
    callouts: [
      { selector: 'input', number: 1 },
      { selector: 'button[type="submit"]', number: 2 },
    ],
  });

  if (!sourceDir && !joygrowBaseUrl.startsWith('http://127.0.0.1')) {
    manifest.skipped.push({ scope: 'student-authenticated', reason: '로컬 데모 소스 또는 문서용 DEMO 계정이 없어 운영 학생 화면을 열지 않았습니다.' });
    await context.close();
    return;
  }

  const login = await context.request.post(`${joygrowBaseUrl}/api/auth/student-login`, { data: { studentId: 'demo-student', pin: '2468' } });
  if (!login.ok()) throw new Error(`데모 학생 로그인 실패: ${login.status()}`);

  const tabs = [
    ['home', 'home.png'],
    ['quests', 'quests.png'],
    ['world', 'world.png'],
    ['ranking', 'ranking.png'],
    ['shop', 'store.png'],
    ['vault', 'growth-record.png'],
  ];
  for (const [hash, file] of tabs) {
    await page.goto(`${joygrowBaseUrl}/student#${hash}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await screenshot(page, `student/${file}`, {
      callouts: [
        { selector: '.header-point-chip', number: 1 },
        { selector: '.student-experience > div > div > section', number: 2 },
        { selector: 'nav', number: 3 },
      ],
    });
    if (hash === 'shop') {
      const buyButton = page.locator('button').filter({ hasText: /^구매하기$/ }).first();
      if (await buyButton.count()) {
        await buyButton.click();
        await page.waitForTimeout(250);
        await screenshot(page, 'student/store-purchase-dialog.png', { fullPage: false });
      }
    }
  }

  await page.goto(`${joygrowBaseUrl}/student#home`, { waitUntil: 'networkidle' });
  const settings = page.locator('button.header-settings-button');
  if (await settings.count()) {
    await settings.click();
    await page.waitForTimeout(250);
    await screenshot(page, 'student/settings-dialog.png', { fullPage: false });
    const characterButton = page.locator('.settings-action-button').first();
    if (await characterButton.count()) {
      await characterButton.click();
      await page.waitForTimeout(250);
      await screenshot(page, 'student/bible-character.png', { fullPage: false });
      const closeCharacter = page.locator('.character-icon-button');
      if (await closeCharacter.count()) await closeCharacter.click();
    }
  }
  if (await settings.count()) {
    await settings.click();
    const pinButton = page.locator('.settings-action-button').nth(1);
    if (await pinButton.count()) {
      await pinButton.click();
      await page.waitForTimeout(250);
      await screenshot(page, 'student/password-dialog.png', { fullPage: false });
    }
  }
  await context.close();
}

async function captureStudentDesktop(browser) {
  if (!sourceDir && !joygrowBaseUrl.startsWith('http://127.0.0.1')) return;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5, locale: 'ko-KR' });
  const login = await context.request.post(`${joygrowBaseUrl}/api/auth/student-login`, { data: { studentId: 'demo-student', pin: '2468' } });
  if (!login.ok()) throw new Error(`데모 학생 PC 로그인 실패: ${login.status()}`);
  const page = await context.newPage();
  for (const [hash, file] of [['home', 'home'], ['quests', 'quests'], ['world', 'world'], ['ranking', 'ranking'], ['vault', 'growth-record']]) {
    await page.goto(`${joygrowBaseUrl}/student#${hash}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    await screenshot(page, `student/desktop-${file}.png`);
  }
  await context.close();

  const errorContext = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  await errorContext.request.post(`${joygrowBaseUrl}/api/auth/student-login`, { data: { studentId: 'demo-student', pin: '2468' } });
  await errorContext.route('**/api/student/dashboard', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '잠시 연결이 원활하지 않아요.' }) }));
  const errorPage = await errorContext.newPage();
  await errorPage.goto(`${joygrowBaseUrl}/student`, { waitUntil: 'networkidle' });
  await screenshot(errorPage, 'student/error-retry.png', { fullPage: false });
  await errorContext.close();
}

async function captureAdmin(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5, locale: 'ko-KR' });
  const page = await context.newPage();
  await page.goto(`${joygrowBaseUrl}/admin/login`, { waitUntil: 'networkidle' });
  await screenshot(page, 'admin/login.png', { fullPage: false });

  if (!sourceDir && !joygrowBaseUrl.startsWith('http://127.0.0.1')) {
    manifest.skipped.push({ scope: 'admin-authenticated', reason: '로컬 데모 모드가 아니므로 운영 관리자 화면을 열지 않았습니다.' });
    await context.close();
    return;
  }

  await page.goto(`${joygrowBaseUrl}/admin`, { waitUntil: 'networkidle' });
  const sections = [
    ['대시보드', 'dashboard.png'],
    ['학생 관리', 'students.png'],
    ['관제센터', 'control-center.png'],
    ['성장 활동', 'growth-activities.png'],
    ['열매상점', 'store.png'],
    ['믿음원정', 'faith-adventure.png'],
    ['성장 정책', 'policy.png'],
    ['감사 로그', 'audit-log.png'],
  ];
  for (const [label, file] of sections) {
    if (label !== '대시보드') {
      const button = page.locator('button').filter({ hasText: label }).first();
      if (!(await button.count())) {
        manifest.skipped.push({ scope: `admin-${label}`, reason: '메뉴 버튼을 찾지 못했습니다.' });
        continue;
      }
      await button.click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, `admin/${file}`, {
      callouts: [
        { selector: 'aside', number: 1 },
        { selector: 'section.min-w-0 h2', number: 2 },
        { selector: 'section.min-w-0 > div.grid > section', number: 3 },
      ],
    });
    if (label === '학생 관리') {
      for (const [buttonText, detailFile] of [['학생 추가', 'student-add-dialog.png'], ['정보', 'student-edit-dialog.png'], ['포인트', 'student-points-dialog.png']]) {
        const action = page.getByRole('button', { name: buttonText, exact: true }).first();
        if (!(await action.count())) continue;
        await action.click();
        await page.waitForTimeout(200);
        await screenshot(page, `admin/${detailFile}`, { fullPage: false });
        await page.keyboard.press('Escape');
      }
    }
  }
  await context.close();
}

async function captureAttendanceLogin(browser) {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  if (attendanceSourceDir) await installAttendanceFixtures(context, 'teacher');
  if (attendanceSourceDir) await context.addInitScript(() => localStorage.removeItem('sb-docs-demo-auth-token'));
  const page = await context.newPage();
  await page.goto(attendanceBaseUrl, { waitUntil: 'networkidle' });
  await screenshot(page, 'teacher/login.png', { fullPage: true });
  await context.close();

  if (attendanceSourceDir) {
    await captureAttendanceDemo(browser, 'teacher');
    await captureAttendanceDemo(browser, 'support');
    await captureAttendanceDemo(browser, 'admin');
    await captureAttendanceDemo(browser, 'pending');
    return;
  }

  const authenticatedContext = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  const authenticatedPage = await authenticatedContext.newPage();
  await authenticatedPage.goto(attendanceBaseUrl, { waitUntil: 'networkidle' });
  const demoName = process.env.ATTENDANCE_DEMO_NAME?.trim();
  const demoPin = process.env.ATTENDANCE_DEMO_PIN?.trim();
  if (!demoName || !/^\d{4}$/.test(demoPin || '') || process.env.DOCS_DEMO_DATA_CONFIRMED !== '1') {
    manifest.skipped.push({ scope: 'attendance-authenticated', reason: '개인정보가 없는 문서 촬영 전용 교사/관리자 DEMO 계정이 아직 연결되지 않았습니다.' });
    await authenticatedContext.close();
    return;
  }

  await authenticatedPage.locator('input[autocomplete="username"]').fill(demoName);
  await authenticatedPage.locator('input[autocomplete="current-password"]').fill(demoPin);
  await authenticatedPage.locator('form button[type="submit"]').click();
  await authenticatedPage.waitForTimeout(2_000);
  if (await authenticatedPage.locator('.login-card').count()) {
    manifest.skipped.push({ scope: 'attendance-authenticated', reason: 'DEMO 계정 로그인 후 반 선택 또는 추가 확인이 필요합니다.' });
    await authenticatedContext.close();
    return;
  }

  await screenshot(authenticatedPage, 'teacher/home.png', { fullPage: true });
  for (const [label, file] of [['JoyGrow', 'joygrow.png'], ['출석', 'attendance.png']]) {
    const button = authenticatedPage.locator('button').filter({ hasText: label }).last();
    if (!(await button.count())) continue;
    await button.click();
    await authenticatedPage.waitForTimeout(800);
    await screenshot(authenticatedPage, `teacher/${file}`, { fullPage: true });
  }
  await authenticatedContext.close();
}

async function captureAttendanceDemo(browser, role) {
  const context = await browser.newContext({ viewport: role === 'admin' ? { width: 1440, height: 1000 } : { width: 430, height: 932 }, deviceScaleFactor: role === 'admin' ? 1.5 : 2, locale: 'ko-KR' });
  await installAttendanceFixtures(context, role);
  const page = await context.newPage();
  const url = role === 'admin' ? `${attendanceBaseUrl}/?tab=joygrow` : attendanceBaseUrl;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1_200);
  if (role === 'admin') {
    async function captureAdminPage(file) {
      await page.waitForTimeout(900);
      await screenshot(page, `admin/${file}`, {
        callouts: [
          { selector: '.workspace-title-copy', number: 1 },
          { selector: '.workspace-page', number: 2 },
          { selector: 'nav[aria-label="주요 메뉴"]', number: 3 },
        ],
      });
    }
    await captureAdminPage('attendance-home.png');
    for (const [label, file] of [
      ['반별 출석', 'attendance-ourclass.png'],
      ['결석', 'attendance-ministry.png'],
      ['학생', 'attendance-students.png'],
      ['주일보고', 'attendance-sunday-report.png'],
      ['전체', 'attendance-all-menu.png'],
    ]) {
      const navButton = page.locator('nav[aria-label="주요 메뉴"] button').filter({ hasText: label }).last();
      if (!(await navButton.count())) throw new Error(`관리자 주요 메뉴를 찾지 못했습니다: ${label}`);
      await navButton.click();
      await captureAdminPage(file);
    }
    for (const [label, file] of [
      ['JoyGrow', 'attendance-control.png'],
      ['재정센터', 'attendance-finance.png'],
      ['생일', 'attendance-birthdays.png'],
      ['기도·헌금', 'attendance-duty.png'],
      ['새가족', 'attendance-new-family.png'],
      ['메시지', 'attendance-messages.png'],
      ['계정·반', 'attendance-accounts.png'],
      ['장결 관리', 'attendance-long-term.png'],
      ['구글 시트', 'attendance-google-sheet.png'],
      ['데이터 점검', 'attendance-integrity.png'],
      ['휴지통', 'attendance-trash.png'],
    ]) {
      const allMenu = page.locator('nav[aria-label="주요 메뉴"] button').filter({ hasText: '전체' }).last();
      await allMenu.click();
      await page.waitForTimeout(250);
      const toolButton = page.locator('main button').filter({ hasText: label }).last();
      if (!(await toolButton.count())) throw new Error(`관리자 전체 메뉴를 찾지 못했습니다: ${label}`);
      await toolButton.click();
      await captureAdminPage(file);
    }
    const allMenu = page.locator('nav[aria-label="주요 메뉴"] button').filter({ hasText: '전체' }).last();
    await allMenu.click();
    await page.waitForTimeout(250);
    const pastoralButton = page.locator('main button').filter({ hasText: '목양센터' }).last();
    if (await pastoralButton.count()) {
      const popupPromise = context.waitForEvent('page');
      await pastoralButton.click();
      const pastoralPage = await popupPromise;
      await pastoralPage.waitForLoadState('networkidle');
      await pastoralPage.waitForTimeout(1_000);
      await screenshot(pastoralPage, 'admin/attendance-pastoral.png', { fullPage: true });
      await pastoralPage.close();
    }
    const homeButton = page.locator('nav[aria-label="주요 메뉴"] button').filter({ hasText: '홈' }).last();
    await homeButton.click();
    await page.waitForTimeout(700);
    const searchButton = page.locator('button[aria-label="빠른 검색"]');
    if (await searchButton.count()) {
      await searchButton.click();
      await page.waitForTimeout(250);
      await screenshot(page, 'admin/attendance-search.png', { fullPage: false });
      await page.keyboard.press('Escape');
    }
    const accountButton = page.locator('button[aria-label="계정 설정"]');
    if (await accountButton.count()) {
      await accountButton.click();
      await page.waitForTimeout(250);
      await screenshot(page, 'admin/attendance-account-settings.png', { fullPage: false });
      await page.keyboard.press('Escape');
    }
  } else if (role === 'support') {
    await screenshot(page, 'teacher/support-praise.png');
  } else if (role === 'pending') {
    await screenshot(page, 'teacher/approval-pending.png', { fullPage: false });
  } else {
    await screenshot(page, 'teacher/home.png');
    for (const [label, file] of [['출석', 'attendance.png'], ['JoyGrow', 'joygrow.png'], ['통계', 'stats.png']]) {
      const button = page.locator('nav button').filter({ hasText: label }).last();
      if (!(await button.count())) continue;
      await button.click();
      await page.waitForTimeout(700);
      await screenshot(page, `teacher/${file}`);
    }
    const accountButton = page.locator('button[aria-label="계정 설정"]');
    if (await accountButton.count()) {
      await accountButton.click();
      await page.waitForTimeout(250);
      await screenshot(page, 'teacher/account-settings.png', { fullPage: false });
    }
  }
  await context.close();
}

try {
  await mkdir(outputRoot, { recursive: true });
  await startLocalJoyGrow();
  await startLocalAttendance();
  const browser = await chromium.launch({ headless: true });
  try {
    await captureStudent(browser);
    await captureStudentDesktop(browser);
    await captureAdmin(browser);
    await captureAttendanceLogin(browser);
  } finally {
    await browser.close();
  }
  await writeFile(path.join(outputRoot, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`캡처 완료: ${manifest.captured.length}개, 건너뜀: ${manifest.skipped.length}개`);
} finally {
  if (server && !server.killed) server.kill();
  if (attendanceServer && !attendanceServer.killed) attendanceServer.kill();
}
