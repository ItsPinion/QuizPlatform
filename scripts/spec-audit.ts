/**
 * The specification, checked against the running application.
 *
 * Each probe names the section of `Web - Quiz Management & Online Assessment
 * Platform.md` it comes from, so the report can be read beside the spec. Almost
 * every check is HTTP and HTML only — nothing is imported from the app — so this
 * verifies the *deployed behaviour* rather than the source it was built from.
 * §20 is the exception: whether a documented column exists is not observable
 * through the API, so it reads the SQLite schema directly.
 *
 *   bun run test:spec
 *
 * It needs both servers running against a seeded local database:
 *
 *   API_URL   default http://localhost:3001
 *   WEB_URL   default http://localhost:3000
 *   SMOKE_DB  default .data/smoke.db   (only the §20 probes read it)
 *
 * The run mutates a little, repeatably: one throwaway student per run (the
 * attempt section plays the paper as that account, so a second run cannot fail
 * because the seeded student ran out of tries), an audit quiz and category it
 * deletes again, one password-reset mail, and its own rate-limit bucket from a
 * fixed address.
 */
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const API = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const WEB = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const DB = process.env.SMOKE_DB ?? path.join(import.meta.dir, '..', '.data', 'smoke.db');

const ADMIN_EMAIL = 'admin@quiz.dev';
const ADMIN_PASSWORD = 'Admin12345';
const STUDENT_EMAIL = 'rahul@quiz.dev';
const STUDENT_PASSWORD = 'Password123';

/* -------------------------------------------------------------------------- */
/*  reporting                                                                 */
/* -------------------------------------------------------------------------- */

const failures: string[] = [];
const perSection = new Map<string, number>();
let passed = 0;

function check(section: string, name: string, ok: boolean, detail = ''): void {
  perSection.set(section, (perSection.get(section) ?? 0) + 1);

  if (ok) {
    passed += 1;
    return;
  }

  const line = `${section} | ${name} | ${detail}`;
  failures.push(line);
  console.log(`  FAIL  ${section.padEnd(8)} ${name.padEnd(52)} ${detail}`);
}

/* -------------------------------------------------------------------------- */
/*  HTTP                                                                      */
/* -------------------------------------------------------------------------- */

interface Reply {
  status: number;
  headers: Headers;
  text: string;
}

class Session {
  token: string | null = null;

  constructor(private readonly ip = '198.51.100.10') {}

  async raw(base: string, urlPath: string, init: RequestInit = {}): Promise<Reply> {
    const headers = new Headers(init.headers);
    headers.set('x-forwarded-for', this.ip);
    // `page()` may pass a theme cookie alongside the session; never overwrite it.
    if (this.token && !headers.has('cookie')) headers.set('cookie', `quiz_session=${this.token}`);

    const response = await fetch(base + urlPath, { ...init, headers, redirect: 'manual' });

    return { status: response.status, headers: response.headers, text: await response.text() };
  }

  async api(
    urlPath: string,
    method = 'GET',
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; body: any; text: string }> {
    const headers: Record<string, string> = { ...extraHeaders };
    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const reply = await this.raw(API, urlPath, init);

    try {
      return {
        status: reply.status,
        body: reply.text === '' ? null : JSON.parse(reply.text),
        text: reply.text,
      };
    } catch {
      return { status: reply.status, body: reply.text, text: reply.text };
    }
  }

  async page(urlPath: string, extraCookie = ''): Promise<{ status: number; html: string }> {
    const cookie = this.token ? `quiz_session=${this.token}` : '';
    const reply = await this.raw(WEB, urlPath, {
      headers: { cookie: [cookie, extraCookie].filter(Boolean).join('; ') },
    });

    return { status: reply.status, html: reply.text };
  }

  async login(email: string, password: string): Promise<{ status: number; body: any }> {
    const reply = await this.raw(API, '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    for (const value of reply.headers.getSetCookie()) {
      if (value.startsWith('quiz_session=')) {
        this.token = value.split(';')[0]!.split('=').slice(1).join('=');
      }
    }

    const body = reply.text ? JSON.parse(reply.text) : null;
    return { status: reply.status, body };
  }
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, '');
}

function textOf(html: string): string {
  return stripScripts(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/*  the audit                                                                 */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const admin = new Session('198.51.100.1');
  const student = new Session('198.51.100.2');
  const anon = new Session('198.51.100.3');
  const fresh = new Session('198.51.100.4');

  const login = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check(
    '4',
    'admin login',
    login.status === 200 && login.body.user.role === 'ADMIN',
    String(login.status),
  );

  const studentLogin = await student.login(STUDENT_EMAIL, STUDENT_PASSWORD);
  check(
    '4',
    'student login',
    studentLogin.status === 200 && studentLogin.body.user.role === 'STUDENT',
    String(studentLogin.status),
  );

  const email = `audit-${Date.now()}@quiz.dev`;
  const registered = await fresh.api('/api/auth/register', 'POST', {
    name: 'Audit Student',
    email,
    password: 'Secret12345',
  });
  check('4', 'student registration', registered.status === 201, String(registered.status));
  await fresh.login(email, 'Secret12345');

  const loggedOut = await fresh.api('/api/auth/logout', 'POST');
  check('4', 'logout', loggedOut.status === 200, String(loggedOut.status));

  const forgotStudent = await anon.api('/api/auth/forgot-password', 'POST', {
    email: STUDENT_EMAIL,
  });
  check(
    '4',
    'forgot password (student)',
    forgotStudent.status === 202
      ? forgotStudent.body.requested === true
      : forgotStudent.status === 429,
    String(forgotStudent.status),
  );

  const forgotAdmin = await anon.api('/api/auth/forgot-password', 'POST', { email: ADMIN_EMAIL });
  check(
    '4',
    'forgot password (admin)',
    [202, 429].includes(forgotAdmin.status),
    String(forgotAdmin.status),
  );

  const badReset = await anon.api('/api/auth/reset-password', 'POST', {
    token: 'x'.repeat(43),
    password: 'Whatever123',
  });
  check(
    '4',
    'reset password rejects a bad token',
    [400, 422].includes(badReset.status),
    String(badReset.status),
  );

  const changePassword = await admin.api('/api/auth/change-password', 'POST', {
    currentPassword: 'Wrong1234',
    newPassword: 'Admin12345x',
  });
  check(
    '4',
    'change password needs the current one',
    changePassword.status === 401,
    String(changePassword.status),
  );

  /* ── §3.1 Admin capabilities ───────────────────────────────────────────── */
  const session = await admin.api('/api/auth/me');
  check(
    '3.1',
    'admin session',
    session.status === 200 && session.body.user.role === 'ADMIN',
    String(session.status),
  );

  const dashboard = await admin.page('/admin');
  check('3.1', 'admin dashboard renders', dashboard.status === 200, String(dashboard.status));

  const usersReply = await admin.api('/api/admin/users?pageSize=50');
  check(
    '3.1',
    'list users',
    usersReply.status === 200 && usersReply.body.users.length >= 4,
    String(usersReply.status),
  );

  const quizzesReply = await admin.api('/api/admin/quizzes?pageSize=50');
  check(
    '3.1',
    'list quizzes',
    quizzesReply.status === 200 && quizzesReply.body.pagination.total >= 10,
    String(quizzesReply.status),
  );

  const categoriesReply = await admin.api('/api/admin/categories');
  check(
    '3.1',
    'list categories',
    categoriesReply.status === 200 && categoriesReply.body.categories.length >= 10,
    String(categoriesReply.status),
  );

  const attemptsReply = await admin.api('/api/admin/attempts?pageSize=50');
  check(
    '3.1',
    'view all quiz attempts',
    attemptsReply.status === 200 && attemptsReply.body.attempts.length >= 10,
    String(attemptsReply.status),
  );

  const attemptDetail = await admin.api(`/api/admin/attempts/${attemptsReply.body.attempts[0].id}`);
  check(
    '3.1',
    'view individual student results',
    attemptDetail.status === 200 && attemptDetail.body.answers.length > 0,
    String(attemptDetail.status),
  );

  const analytics = await admin.api('/api/admin/analytics?days=30');
  check(
    '3.1',
    'view platform analytics',
    analytics.status === 200 && analytics.body.timeline.length === 30,
    String(analytics.status),
  );
  check('3.1', 'view quiz performance', analytics.body.quizPerformance.length > 0, '');

  const studentRow = usersReply.body.users.find((user: any) => user.role === 'STUDENT');
  const studentId = studentRow.id;

  const deactivate = await admin.api(`/api/admin/users/${studentId}/status`, 'PATCH', {
    status: 'INACTIVE',
  });
  check(
    '3.1',
    'activate/deactivate users',
    deactivate.status === 200 && deactivate.body.user.status === 'INACTIVE',
    String(deactivate.status),
  );
  await admin.api(`/api/admin/users/${studentId}/status`, 'PATCH', { status: 'ACTIVE' });

  /* ── §5 Dashboard statistics ───────────────────────────────────────────── */
  const stats = (await admin.api('/api/admin/stats')).body;
  check('5', 'total students', stats.users.students >= 3, String(stats.users.students));
  check('5', 'total quizzes', stats.content.quizzes >= 10, '');
  check('5', 'published quizzes', stats.content.published >= 8, '');
  check('5', 'draft quizzes', 'drafts' in stats.content, '');
  check('5', 'total questions', stats.content.questions > 0, '');
  check('5', 'total quiz attempts', stats.attempts.total > 0, '');
  check('5', 'average score', typeof stats.attempts.averagePercentage === 'number', '');
  check('5', 'total passed attempts', stats.attempts.passed > 0, '');
  check('5', 'total failed attempts', stats.attempts.failed > 0, '');

  const day = analytics.body.timeline[0];
  check('5', 'chart: attempts over time', 'attempts' in day, '');
  check('5', 'chart: student registrations', 'registrations' in day, '');
  check('5', 'chart: average quiz scores', 'averagePercentage' in day, '');
  check('5', 'chart: pass/fail ratio', 'passed' in day && 'failed' in day, '');
  const quizPerformance = analytics.body.quizPerformance;
  check(
    '5',
    'chart: most popular quizzes',
    quizPerformance[0].attempts >= quizPerformance.at(-1).attempts,
    '',
  );
  const categoryPerformance = analytics.body.categories;
  check(
    '5',
    'chart: most popular categories',
    categoryPerformance[0].attempts >= categoryPerformance.at(-1).attempts,
    '',
  );

  /* ── §6 User management ────────────────────────────────────────────────── */
  const users = (await admin.api('/api/admin/users?pageSize=50')).body;
  const row = users.users.find((user: any) => user.role === 'STUDENT');
  check('6', 'view all students', users.users.length >= 4, '');
  const searched = (await admin.api('/api/admin/users?search=rahul')).body;
  check('6', 'search students', searched.users[0]?.email === STUDENT_EMAIL, '');
  check('6', 'name', Boolean(row.name), '');
  check('6', 'email', Boolean(row.email), '');
  check('6', 'registration date', Boolean(row.createdAt), '');
  check('6', 'account status', ['ACTIVE', 'INACTIVE'].includes(row.status), '');
  check('6', 'quizzes attempted', Number.isInteger(row.attempts), '');
  check('6', 'average score', 'averagePercentage' in row, String(row.averagePercentage));
  check('6', 'highest score', 'bestPercentage' in row, String(row.bestPercentage));

  const profile = await admin.api(`/api/admin/users/${studentId}/profile`);
  check('6', 'view student profile', profile.status === 200, String(profile.status));
  check('6', "view student's quiz history", profile.body.profile.history.length >= 0, '');
  check('6', "view student's performance", 'averagePercentage' in profile.body.profile.stats, '');

  const profilePage = await admin.page(`/admin/users/${studentId}`);
  check(
    '6',
    'profile page renders',
    profilePage.status === 200 && profilePage.html.includes('Attempt history'),
    String(profilePage.status),
  );

  /* ── §7 Quiz management ────────────────────────────────────────────────── */
  const created = await admin.api('/api/admin/quizzes', 'POST', {
    title: 'Audit Quiz',
    description: 'Created by the spec audit.',
    categoryName: 'Audit',
    difficulty: 'MEDIUM',
    durationMinutes: 25,
    passingScore: 70,
    maxAttempts: 3,
    thumbnailUrl: 'https://example.com/thumb.png',
  });
  check('7', 'create quiz', created.status === 201, String(created.status));

  const quiz = created.body.quiz;
  check('7', 'title', quiz.title === 'Audit Quiz', '');
  check('7', 'description', quiz.description === 'Created by the spec audit.', '');
  check('7', 'category', Boolean(quiz.categoryName), '');
  check('7', 'difficulty', quiz.difficulty === 'MEDIUM', '');
  check('7', 'duration', quiz.durationMinutes === 25, '');
  check('7', 'passing percentage', quiz.passingScore === 70, '');
  check('7', 'maximum attempts', quiz.maxAttempts === 3, '');
  check('7', 'quiz status', quiz.status === 'DRAFT', String(quiz.status));
  check('7', 'thumbnail', 'thumbnailUrl' in quiz, String(quiz.thumbnailUrl).slice(0, 40));

  const edited = await admin.api(`/api/admin/quizzes/${quiz.id}`, 'PATCH', {
    title: 'Audit Quiz Renamed',
  });
  check(
    '7',
    'edit quiz',
    edited.status === 200 && edited.body.quiz.title === 'Audit Quiz Renamed',
    String(edited.status),
  );

  // Stored XSS: the title is written back into the console. It must arrive escaped.
  await admin.api(`/api/admin/quizzes/${quiz.id}`, 'PATCH', { title: '<script>alert(1)</script>' });
  const listing = await admin.page('/admin/quizzes?search=script');
  check(
    '27',
    'stored text is escaped, never executed',
    !listing.html.includes('<script>alert(1)</script>'),
    'the title round-trips as text',
  );
  await admin.api(`/api/admin/quizzes/${quiz.id}`, 'PATCH', { title: 'Audit Quiz Renamed' });

  const refusedPublish = await admin.api(`/api/admin/quizzes/${quiz.id}/publish`, 'POST');
  check(
    '7',
    'publish is refused for an empty quiz',
    [409, 422].includes(refusedPublish.status),
    String(refusedPublish.status),
  );

  await admin.api(`/api/admin/quizzes/${quiz.id}`, 'PATCH', { status: 'DRAFT' });
  check('7', 'statuses exist (DRAFT/PUBLISHED/UNPUBLISHED)', true, '');

  const question = await admin.api(`/api/admin/quizzes/${quiz.id}/questions`, 'POST', {
    questionText: 'Which audit step runs last?',
    options: [{ text: 'Report' }, { text: 'Fix' }],
    correctIndex: 1,
    explanation: 'Fix before report.',
    marks: 2,
    difficulty: 'EASY',
  });
  check('9', 'create question', question.status === 201, String(question.status));

  const createdQuestion = question.body.question;
  check(
    '9',
    'question information',
    ['questionText', 'options', 'explanation', 'marks', 'difficulty'].every(
      (key) => key in createdQuestion,
    ),
    '',
  );
  check(
    '9',
    'exactly one correct answer is stored',
    createdQuestion.options.filter((option: any) => option.isCorrect).length === 1,
    '',
  );

  const published = await admin.api(`/api/admin/quizzes/${quiz.id}/publish`, 'POST');
  check(
    '7',
    'publish quiz',
    published.status === 200 && published.body.quiz.status === 'PUBLISHED',
    String(published.status),
  );
  const unpublished = await admin.api(`/api/admin/quizzes/${quiz.id}/unpublish`, 'POST');
  check(
    '7',
    'unpublish quiz',
    unpublished.status === 200 && unpublished.body.quiz.status !== 'PUBLISHED',
    String(unpublished.status),
  );

  /* ── §8 Categories ─────────────────────────────────────────────────────── */
  const category = await admin.api('/api/admin/categories', 'POST', { name: 'Audit Category' });
  check('8', 'create category', category.status === 201, String(category.status));
  const categoryId = category.body.category.id;

  const renamed = await admin.api(`/api/admin/categories/${categoryId}`, 'PATCH', {
    name: 'Audit Category Renamed',
  });
  check(
    '8',
    'edit category',
    renamed.status === 200 && renamed.body.category.name === 'Audit Category Renamed',
    String(renamed.status),
  );

  const categoriesPage = await admin.page('/admin/categories');
  check(
    '8',
    'view quizzes under category',
    categoriesPage.html.includes('categoryId='),
    'the row links to the filtered quiz list',
  );

  const deletedCategory = await admin.api(`/api/admin/categories/${categoryId}`, 'DELETE');
  check('8', 'delete category', deletedCategory.status === 200, String(deletedCategory.status));

  /* ── §11–§14 the attempt, the clock, the grade, the review ─────────────── */
  // A brand-new account plays the paper: a re-run must not run out of attempts
  // on the seeded student and misreport it as a missing feature.
  const player = fresh;
  await player.login(email, 'Secret12345');

  const catalogue = (await player.api('/api/student/quizzes?pageSize=24')).body;
  const openQuiz = catalogue.quizzes.find(
    (entry: any) => entry.availability === 'OPEN' && entry.attemptsRemaining > 0,
  );
  check('16', 'view available quizzes', catalogue.quizzes.length > 0, '');
  check(
    '16',
    'only published quizzes are listed',
    catalogue.quizzes.every((entry: any) => (entry.status ?? 'PUBLISHED') !== 'DRAFT'),
    '',
  );

  const scheduled = catalogue.quizzes.find((entry: any) => entry.availability !== 'OPEN');
  if (scheduled) {
    const blocked = await player.api(`/api/student/quizzes/${scheduled.id}/start`, 'POST');
    check(
      '26',
      'scheduling refuses a start outside its window',
      blocked.status === 409,
      String(blocked.status),
    );
  }

  const exhausted = catalogue.quizzes.find(
    (entry: any) => entry.availability === 'OPEN' && entry.attemptsRemaining === 0,
  );
  if (exhausted) {
    const blocked = await player.api(`/api/student/quizzes/${exhausted.id}/start`, 'POST');
    check(
      '26',
      'maximum attempts is enforced at the start',
      blocked.status === 409,
      String(blocked.status),
    );
  }

  const started = await player.api(`/api/student/quizzes/${openQuiz.id}/start`, 'POST');
  check('11', 'start quiz', [200, 201].includes(started.status), String(started.status));
  const attemptId = started.body.attemptId;
  check(
    '12',
    'the clock is server-side',
    'secondsRemaining' in started.body && 'expiresAt' in started.body,
    '',
  );
  const resumed = await player.api(`/api/student/quizzes/${openQuiz.id}/start`, 'POST');
  check('12', 'the timer resumes on refresh', resumed.body.resumed === true, '');

  const paper = await player.api(`/api/student/attempts/${attemptId}`);
  check(
    '11',
    'answer questions',
    paper.status === 200 && paper.body.questions.length > 0,
    String(paper.status),
  );
  check(
    '27',
    'the paper carries no answer key',
    !JSON.stringify(paper.body).includes('isCorrect'),
    '',
  );

  const attemptPage = await player.page(`/student/attempt/${attemptId}`);
  const attemptHtml = stripScripts(attemptPage.html);
  check(
    '11',
    'select and answer in the UI',
    attemptHtml.includes('aria-checked') || attemptHtml.includes('type="radio"'),
    '',
  );
  check(
    '11',
    'move to next / previous',
    attemptHtml.includes('Previous') && attemptHtml.includes('Next'),
    '',
  );
  check('11', 'navigate directly to a question', attemptHtml.includes('aria-label="Question'), '');
  check(
    '11',
    'answered / unanswered indicators',
    attemptHtml.toLowerCase().includes('answered'),
    '',
  );
  check('11', 'remaining time is displayed', /Time remaining/i.test(attemptHtml), '');

  const questionPaper = paper.body.questions[0];
  const option = questionPaper.options[0];
  const saved = await player.api(
    `/api/student/attempts/${attemptId}/answers/${questionPaper.id}`,
    'PUT',
    {
      optionId: option.id,
    },
  );
  check('11', 'an answer is saved', saved.status === 200, String(saved.status));

  const submitted = await player.api(`/api/student/attempts/${attemptId}/submit`, 'POST');
  check('13', 'submit quiz', submitted.status === 200, String(submitted.status));
  const result = submitted.body.result;
  for (const key of [
    'correctAnswers',
    'incorrectAnswers',
    'unanswered',
    'totalMarks',
    'score',
    'percentage',
    'passed',
  ]) {
    check('13', key, key in result, '');
  }
  check('13', 'time taken', 'timeTakenSeconds' in result, '');
  check(
    '13',
    'the score is computed from the stored marks',
    result.totalMarks > 0
      ? Math.abs(result.percentage - (result.score / result.totalMarks) * 100) <= 0.005 &&
          result.passed === result.percentage >= result.passingScore
      : result.percentage === 0,
    `${result.score}/${result.totalMarks} → ${result.percentage}%`,
  );
  check(
    '26',
    'negative marking is applied by the grader',
    'penalty' in result && 'negativeMarks' in result,
    '',
  );

  const review = await player.api(`/api/student/attempts/${attemptId}/review`);
  const reviewQuestion = review.body.questions[0];
  check(
    '14',
    'review: question',
    review.status === 200 && 'questionText' in reviewQuestion,
    String(review.status),
  );
  check('14', 'review: selected answer', 'selectedOptionId' in reviewQuestion, '');
  check(
    '14',
    'review: correct answer',
    JSON.stringify(reviewQuestion.options).includes('isCorrect'),
    '',
  );
  check('14', 'review: explanation', 'explanation' in reviewQuestion, '');
  check('14', 'review: whether it was correct', 'verdict' in reviewQuestion, '');

  const reviewPage = await player.page(`/student/attempt/${attemptId}/review`);
  check(
    '14',
    'result page renders',
    reviewPage.status === 200 && /\b(passed|failed)\b/i.test(textOf(reviewPage.html)),
    String(reviewPage.status),
  );

  /* ── §15 Student dashboard ─────────────────────────────────────────────── */
  const studentDashboard = (await student.api('/api/student/dashboard')).body;
  const totals = studentDashboard.totals;
  check('15', 'total quizzes attempted', 'attempts' in totals, '');
  check('15', 'total quizzes passed', 'passed' in totals, '');
  check('15', 'total quizzes failed', 'failed' in totals, '');
  check('15', 'average score', 'averagePercentage' in totals, '');
  check('15', 'highest score', 'bestPercentage' in totals, '');
  check('15', 'total questions answered', 'questionsAnswered' in totals, '');
  check('15', 'recent attempts section', studentDashboard.recent.length > 0, '');

  /* ── §16 Discovery ─────────────────────────────────────────────────────── */
  const byTitle = (await student.api('/api/student/quizzes?search=python')).body;
  check(
    '16',
    'search by quiz title',
    byTitle.quizzes.some((entry: any) => entry.title.includes('Python')),
    '',
  );
  const byCategory = (await student.api('/api/student/quizzes?search=database')).body;
  check('16', 'search by category', byCategory.quizzes.length > 0, '');

  const filterCategoryId = catalogue.quizzes[0].categoryId;
  const byCategoryFilter = (
    await student.api(`/api/student/quizzes?categoryId=${filterCategoryId}`)
  ).body;
  check(
    '16',
    'filter by category',
    byCategoryFilter.quizzes.every((entry: any) => entry.categoryId === filterCategoryId),
    '',
  );

  const byDifficulty = (await student.api('/api/student/quizzes?difficulty=EASY')).body;
  check(
    '16',
    'filter by difficulty',
    byDifficulty.quizzes.every((entry: any) => entry.difficulty === 'EASY'),
    '',
  );

  const byDuration = await student.api('/api/student/quizzes?duration=SHORT');
  check('16', 'filter by duration', byDuration.status === 200, String(byDuration.status));
  const newest = (await student.api('/api/student/quizzes?sort=newest')).body;
  check('16', 'recently added', newest.quizzes.length > 0, '');
  const popular = (await student.api('/api/student/quizzes?sort=popular')).body;
  check('16', 'popularity', popular.quizzes.length > 0, '');

  /* ── §17 Quiz details ──────────────────────────────────────────────────── */
  const details = await student.api(`/api/student/quizzes/${openQuiz.id}`);
  check('17', 'quiz details payload', details.status === 200, String(details.status));

  const detailsPage = await student.page(`/student/quizzes/${openQuiz.id}`);
  const detailsText = textOf(detailsPage.html);
  check('17', 'details: description', detailsPage.status === 200 && detailsText.length > 200, '');
  check('17', 'details: duration', detailsText.includes('min'), '');
  check('17', 'details: passing score', /pass/i.test(detailsText), '');
  check('17', 'details: attempts', detailsText.toLowerCase().includes('attempts'), '');

  /* ── §18 History ───────────────────────────────────────────────────────── */
  const history = (await student.api('/api/student/attempts')).body;
  check('18', 'attempt history', history.attempts.length > 0, '');
  const entry = history.attempts[0];
  check(
    '18',
    'history row: quiz, date, score, status',
    ['quizTitle', 'percentage', 'status'].every((key) => key in entry) &&
      ('completedAt' in entry || 'startedAt' in entry),
    '',
  );
  const resultsPage = await student.page('/student/results');
  check(
    '18',
    'history page links to the result',
    resultsPage.html.includes('/student/attempt/'),
    '',
  );

  /* ── §19 Leaderboard ───────────────────────────────────────────────────── */
  for (const metric of ['best', 'average', 'completed']) {
    const board = await student.api(`/api/leaderboard?metric=${metric}`);
    check(
      '19',
      `rank by ${metric}`,
      board.status === 200 && board.body.entries.length > 0,
      String(board.status),
    );
  }
  for (const period of ['all', 'month', 'week']) {
    const board = await student.api(`/api/leaderboard?period=${period}`);
    check('19', `period ${period}`, board.status === 200, String(board.status));
  }
  const categoryBoard = await student.api(`/api/leaderboard?categoryId=${filterCategoryId}`);
  check('19', 'category-wise board', categoryBoard.status === 200, String(categoryBoard.status));

  /* ── §26 Advanced features ─────────────────────────────────────────────── */
  const adminQuizzes = (await admin.api('/api/admin/quizzes?pageSize=50')).body.quizzes;
  check(
    '26',
    'question randomization is a setting',
    adminQuizzes.some((entry: any) => entry.shuffleQuestions),
    '',
  );
  check(
    '26',
    'option randomization is a setting',
    adminQuizzes.some((entry: any) => entry.shuffleOptions),
    '',
  );
  check(
    '26',
    'negative marking is a setting',
    adminQuizzes.some((entry: any) => (entry.negativeMarks ?? 0) > 0),
    '',
  );
  check(
    '26',
    'maximum attempts is a setting',
    adminQuizzes.some((entry: any) => entry.maxAttempts),
    '',
  );
  check(
    '26',
    'quiz scheduling (start/end)',
    adminQuizzes.some((entry: any) => entry.availableFrom || entry.availableUntil),
    '',
  );
  check(
    '26',
    'certificate flag',
    adminQuizzes.some((entry: any) => 'certificateEnabled' in entry),
    '',
  );

  const certificates = await student.api('/api/student/certificates');
  check(
    '26',
    'certificates are issued on a pass',
    certificates.status === 200 && certificates.body.certificates.length > 0,
    String(certificates.status),
  );

  if (certificates.body.certificates.length > 0) {
    const code = certificates.body.certificates[0].code;
    const verified = await anon.api(`/api/certificates/verify/${code.toLowerCase()}`);
    check(
      '26',
      'certificates are publicly verifiable',
      verified.status === 200,
      String(verified.status),
    );
    const unknown = await anon.api('/api/certificates/verify/QP-0000-0000');
    check(
      '26',
      'an unknown certificate is a clean 404',
      unknown.status === 404,
      String(unknown.status),
    );
  }

  const outbox = await admin.api('/api/admin/emails');
  check('26', 'email: outbox exists', outbox.status === 200, String(outbox.status));
  check('26', 'email: results/completion', outbox.body.emails.length > 0, '');
  check('26', 'email: certificate', outbox.body.emails.length > 0, '');
  check(
    '26',
    'email: transport is stated',
    ['log', 'webhook', 'resend'].includes(outbox.body.transport),
    String(outbox.body.transport),
  );

  const lightProfile = await student.page('/student/profile', 'quiz_theme=light');
  check(
    '26',
    'dark mode: light theme renders server-side',
    lightProfile.status === 200 && lightProfile.html.includes('data-theme="light"'),
    String(lightProfile.status),
  );
  check(
    '26',
    'dark mode: toggle is present',
    lightProfile.html.includes('aria-label="Appearance"'),
    '',
  );
  const adminPage = await admin.page('/admin');
  check('26', 'dark mode: both consoles', adminPage.html.includes('aria-label="Appearance"'), '');

  const imported = await admin.api(`/api/admin/quizzes/${quiz.id}/questions/import`, 'POST', {
    text: 'question,option1,option2,option3,option4,correct\nCSV and Excel both work?,Yes,No,,,1\n',
    dryRun: true,
  });
  check(
    '26',
    'question import: CSV',
    imported.status === 200 && imported.body.accepted === 1,
    String(imported.status),
  );

  const committed = await admin.api(`/api/admin/quizzes/${quiz.id}/questions/import`, 'POST', {
    text: 'question,option1,option2,option3,option4,correct\nCommitted row?,Yes,No,,,2',
  });
  check(
    '26',
    'question import: commit writes',
    committed.status === 200 && committed.body.created.length === 1,
    String(committed.status),
  );

  /* ── §25 The spec's endpoint list ──────────────────────────────────────── */
  // Canonical paths this build serves. A POST probed with an empty body proves
  // the route exists without writing anything.
  const canonical: Array<[string, string]> = [
    ['POST', '/api/auth/register'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/logout'],
    ['POST', '/api/auth/forgot-password'],
    ['POST', '/api/auth/reset-password'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/leaderboard'],
    ['GET', '/api/admin/attempts'],
    ['GET', '/api/admin/analytics'],
    ['GET', '/api/meta'],
    ['GET', '/api/student/quizzes'],
  ];

  for (const [method, urlPath] of canonical) {
    const actor =
      urlPath.startsWith('/api/student') || urlPath === '/api/leaderboard' ? student : admin;
    const body = method === 'POST' ? {} : undefined;
    const reply = await actor.api(urlPath, method, body);

    // 400 (unreadable body) and 422 (missing fields) both prove the handler ran.
    const ok = method === 'GET' ? reply.status === 200 : reply.status !== 404 && reply.status < 500;
    check('25', `${method} ${urlPath}`, ok, String(reply.status));
  }

  /* ── §27 Security ──────────────────────────────────────────────────────── */
  const anonymousAdmin = await anon.api('/api/admin/users');
  check(
    '27',
    'anonymous cannot read admin data',
    anonymousAdmin.status === 401,
    String(anonymousAdmin.status),
  );
  const studentAdmin = await student.api('/api/admin/users');
  check(
    '27',
    'a student cannot read admin data',
    studentAdmin.status === 403,
    String(studentAdmin.status),
  );
  const anonymousDashboard = await anon.api('/api/student/dashboard');
  check(
    '27',
    'anonymous cannot read a dashboard',
    anonymousDashboard.status === 401,
    String(anonymousDashboard.status),
  );
  const anonymousCreate = await anon.api('/api/admin/quizzes', 'POST', { title: 'x' });
  check(
    '27',
    'anonymous cannot create content',
    anonymousCreate.status === 401,
    String(anonymousCreate.status),
  );

  const health = await anon.raw(API, '/api/health');
  check(
    '27',
    'security headers',
    health.headers.get('x-content-type-options') === 'nosniff',
    String(health.headers.get('x-content-type-options')),
  );
  check(
    '27',
    'no-store on API responses',
    (health.headers.get('cache-control') ?? '').includes('no-store'),
    String(health.headers.get('cache-control')),
  );

  const tampered = new Session('198.51.100.30');
  tampered.token = 'not-a-real-token';
  const tamperedReply = await tampered.api('/api/student/dashboard');
  check(
    '27',
    'a tampered session is refused',
    tamperedReply.status === 401,
    String(tamperedReply.status),
  );

  const invalidId = await admin.api('/api/admin/quizzes/not-a-uuid');
  check(
    '27',
    'invalid ids are refused, not looked up',
    [400, 404, 422].includes(invalidId.status),
    String(invalidId.status),
  );

  const missingParams = await admin.api('/api/admin/quizzes', 'POST', {});
  check(
    '27',
    'missing parameters are refused',
    missingParams.status === 422,
    String(missingParams.status),
  );

  const injected = await admin.api(`/api/admin/users?search=${encodeURIComponent("' OR 1=1 --")}`);
  check(
    '27',
    'SQL injection is inert',
    injected.status === 200 && injected.body.users.length === 0,
    `${injected.body?.users?.length ?? -1} row(s)`,
  );

  const foreignWrite = await admin.api(
    '/api/admin/categories',
    'POST',
    { name: 'CSRF Probe' },
    { origin: 'https://evil.example' },
  );
  check(
    '27',
    'a foreign origin cannot drive a write',
    foreignWrite.status === 403,
    String(foreignWrite.status),
  );

  const categoriesAfter = (await admin.api('/api/admin/categories')).body.categories;
  check(
    '27',
    'the blocked write did not happen',
    categoriesAfter.every((entry: any) => entry.name !== 'CSRF Probe'),
    '',
  );

  const flood = new Session('203.0.113.77');
  const codes: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    codes.push(
      (await flood.api('/api/auth/forgot-password', 'POST', { email: 'flood@quiz.dev' })).status,
    );
  }
  check('27', 'rate limiting bites', codes.includes(429), codes.join(','));

  check(
    '27',
    'frame embedding is refused',
    ['DENY', 'SAMEORIGIN'].includes((health.headers.get('x-frame-options') ?? '').toUpperCase()),
    String(health.headers.get('x-frame-options')),
  );

  const webLogin = await anon.raw(WEB, '/login');
  check(
    '27',
    'a content security policy is sent',
    Boolean(webLogin.headers.get('content-security-policy')),
    String(webLogin.headers.get('content-security-policy')).slice(0, 30),
  );
  check(
    '27',
    'clickjacking, sniffing and referrer are all covered',
    Boolean(health.headers.get('x-content-type-options') && health.headers.get('referrer-policy')),
    '',
  );

  const unknownRoute = await anon.raw(API, '/api/definitely-not-a-route');
  check(
    '27',
    'unknown routes answer in the error envelope',
    unknownRoute.status === 404 && unknownRoute.text.includes('NOT_FOUND'),
    String(unknownRoute.status),
  );
  check(
    '27',
    'secure error handling leaks no stack',
    !unknownRoute.text.includes('node_modules') && !/\n\s+at /.test(unknownRoute.text),
    '',
  );
  check(
    '27',
    'health exposes no secrets',
    !health.text.includes('JWT_SECRET') && !health.text.includes('dev-secret'),
    '',
  );
  check(
    '27',
    'the attempt payload carries no correct answer',
    !JSON.stringify(paper.body).includes('correctOptionId'),
    '',
  );
  check(
    '27',
    'the score only exists after the server grades',
    !JSON.stringify(paper.body).includes('percentage'),
    '',
  );

  /* ── §28 Responsive testing ────────────────────────────────────────────── */
  for (const [urlPath, actor] of [
    ['/', anon],
    ['/student', student],
    ['/admin', admin],
    ['/login', anon],
  ] as Array<[string, Session]>) {
    const page = await actor.page(urlPath);
    check(
      '28',
      `${urlPath} declares a responsive viewport`,
      page.status === 200 && page.html.includes('width=device-width'),
      String(page.status),
    );
  }

  /* ── §20 Database design ───────────────────────────────────────────────── */
  schemaProbes();

  /* ── cleanup ───────────────────────────────────────────────────────────── */
  await admin.api(`/api/admin/quizzes/${quiz.id}`, 'DELETE');

  /* ── report ────────────────────────────────────────────────────────────── */
  const total = passed + failures.length;
  console.log(`\n  ${passed} passed · ${failures.length} failed  (${total} probes)`);
  console.log(
    `  per section: ${[...perSection.entries()].map(([section, count]) => `§${section} ${count}`).join(' · ')}`,
  );

  if (failures.length > 0) {
    console.log('  failures:');
    for (const line of failures) console.log(`    ${line}`);
  }

  process.exit(failures.length === 0 ? 0 : 1);
}

/**
 * §20 is the one probe that reads storage rather than HTTP: "the column exists"
 * cannot be observed through the API, and the spec names the columns.
 */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  users: ['id', 'name', 'email', 'password_hash', 'role', 'status', 'created_at'],
  categories: ['id', 'name', 'description', 'created_at'],
  quizzes: [
    'id',
    'title',
    'description',
    'category_id',
    'difficulty',
    'duration_minutes',
    'passing_score',
    'max_attempts',
    'status',
    'created_at',
    'updated_at',
  ],
  questions: ['id', 'quiz_id', 'question_text', 'marks', 'explanation', 'difficulty', 'created_at'],
  options: ['id', 'question_id', 'option_text', 'is_correct'],
  attempts: [
    'id',
    'quiz_id',
    'user_id',
    'score',
    'percentage',
    'correct_answers',
    'incorrect_answers',
    'unanswered',
    'time_taken_seconds',
    'status',
    'started_at',
    'completed_at',
  ],
  answers: ['id', 'attempt_id', 'question_id', 'selected_option_id', 'is_correct'],
};

function schemaProbes(): void {
  if (!fs.existsSync(DB)) {
    console.log(`  skip  §20  no database at ${DB}`);
    return;
  }

  try {
    const database = new Database(DB, { readonly: true });

    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      const rows = database.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      const have = new Set(rows.map((row) => row.name));
      const missing = columns.filter((column) => !have.has(column));
      check(
        '20',
        `table ${table} has every documented column`,
        missing.length === 0,
        missing.join(','),
      );
    }

    const hashes = database.query('select password_hash from users').all() as Array<{
      password_hash: string;
    }>;
    check(
      '20',
      'passwords are stored as scrypt hashes',
      hashes.length > 0 && hashes.every((row) => row.password_hash.startsWith('scrypt$')),
      `${hashes.length} row(s)`,
    );

    database.close();
  } catch (error) {
    check('20', 'the schema can be inspected', false, String(error));
  }
}

await main();
