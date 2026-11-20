'use strict';
/*
 * Учёба (вызывается из server.js после проверки входа): студент — главная, расписание, оценки, рейтинг группы;
 * преподаватель — свои предметы, студенты закреплённых групп, выставление оценок, добавление занятий.
 * Группы преподавателю назначает администратор (teacherHasGroup). handle(...) возвращает false, если запрос не о учёбе.
 */
function createStudy(ctx) {
  const { getDB, saveDB, ok, bad, audit, nid, isOnline, settingsOf, pushInbox, subjName, teacherFio, avgOf, nextLesson,
    detectDiscipline, teacherHasGroup, teacherGroups, WEEKDAYS } = ctx;
  return async function handle(p, req, res, u, body, url) {
    const db = getDB();
    /* ---------- Студент ---------- */
    if (p === '/api/student/dashboard' && u.role === 'student') {
      const rows = db.grades.filter((g) => g.studentId === u.id);
      const score = rows.length ? Math.round((rows.reduce((a, g) => a + Number(g.score || 0), 0) / rows.length) * 10) / 10 : null;
      return ok(res, { score, next: nextLesson(u.group), group: u.group });
    }

    if (p === '/api/schedule' && req.method === 'GET') {
      const rows = u.role === 'student'
        ? db.schedule.filter((s) => s.group === u.group)
        : db.schedule.filter((s) => s.teacherId === u.id);
      const items = rows.map((r) => ({
        id: r.id, day: r.day, dayName: WEEKDAYS[r.day], type: r.type,
        start: r.start, end: r.end, room: r.room,
        subject: subjName(r.subjectId), teacher: teacherFio(r.teacherId), group: r.group,
      })).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
      return ok(res, { items });
    }

    if (p === '/api/grades' && u.role === 'student') {
      const items = db.grades.filter((g) => g.studentId === u.id).map((g) => ({
        id: g.id, subject: subjName(g.subjectId), teacher: teacherFio(g.teacherId), score: g.score, date: g.date,
      }));
      return ok(res, { items, avg: avgOf(u.id) });
    }

    if (p === '/api/rating' && u.role === 'student') {
      const mates = db.users.filter((x) => x.role === 'student' && x.group === u.group);
      // «Показывать меня в рейтинге» выключено — студента нет в рейтинге у одногруппников (ни имени, ни строки);
      // себя студент видит всегда, с пометкой, что скрыт
      const rows = mates.filter((m) => m.id === u.id || settingsOf(m).showInRating)
        .map((m) => ({ id: m.id, fio: m.fio, online: m.id !== u.id && isOnline(m), avg: avgOf(m.id) }))
        .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
        .map((r, i) => Object.assign(r, { pos: i + 1 }));
      const self = rows.find((r) => r.id === u.id);
      return ok(res, { group: u.group, selfPos: self ? self.pos : null, selfAvg: self ? self.avg : null, total: rows.length, selfHidden: !settingsOf(u).showInRating, rows });
    }

    /* ---------- Преподаватель ---------- */
    if (p === '/api/teacher/subjects' && req.method === 'GET' && u.role === 'teacher') {
      return ok(res, { items: db.subjects.filter((s) => s.teacherId === u.id) });
    }
    if (p === '/api/teacher/subjects' && req.method === 'POST' && u.role === 'teacher') {
      const name = String(body.name || '').trim().slice(0, 160);
      if (name.length < 2) return bad(res, 400, 'Укажите название предмета');
      const s = { id: nid('sub'), name, teacherId: u.id, discipline: detectDiscipline(name) };
      db.subjects.push(s); saveDB();
      return ok(res, { id: s.id, name: s.name, discipline: s.discipline });
    }

    /* Группы преподавателя — те, что закрепил администратор (админ-панель → «Группы»), с числом студентов */
    if (p === '/api/teacher/groups' && req.method === 'GET' && u.role === 'teacher') {
      const groups = teacherGroups(u);
      const items = groups.map((g) => ({ group: g, students: db.users.filter((x) => x.role === 'student' && x.group === g).length }));
      return ok(res, { items });
    }
    if (p === '/api/teacher/students' && req.method === 'GET' && u.role === 'teacher') {
      const g = String(url.searchParams.get('group') || '').trim();
      const groups = new Set(teacherGroups(u));
      const items = db.users.filter((x) => x.role === 'student' && groups.has(x.group) && (!g || x.group === g))
        .map((x) => ({ id: x.id, fio: x.fio, group: x.group, online: isOnline(x) }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.fio.localeCompare(b.fio));
      return ok(res, { items });
    }

    if (p === '/api/teacher/grades' && req.method === 'POST' && u.role === 'teacher') {
      const { studentId = '', subjectId = '', score = 0 } = body;
      const st = db.users.find((x) => x.id === studentId && x.role === 'student');
      const sub = db.subjects.find((x) => x.id === subjectId && x.teacherId === u.id);
      const sc = Number(score);
      if (!st) return bad(res, 400, 'Выберите студента');
      if (!sub) return bad(res, 400, 'Выберите свой предмет');
      if (!teacherGroups(u).includes(st.group)) return bad(res, 403, 'Эта группа не закреплена за вами. Её назначает администратор портала');
      if (!(sc >= 0 && sc <= 100)) return bad(res, 400, 'Балл — число от 0 до 100');
      const g = { id: nid('gr'), studentId, subjectId, teacherId: u.id, score: sc, date: new Date().toISOString().slice(0, 10) };
      db.grades.push(g);
      pushInbox(st, { type: 'grade', subject: sub.name, score: sc });
      saveDB();
      audit('portal.grade', u.id, st.id);
      return ok(res, { id: g.id });
    }

    if (p === '/api/teacher/schedule' && req.method === 'POST' && u.role === 'teacher') {
      const { subjectId = '', type = 'Практ.', group = '', day = 0, startTime = '', endTime = '', room = '' } = body;
      const sub = db.subjects.find((s) => s.id === subjectId && s.teacherId === u.id);
      if (!sub) return bad(res, 400, 'Выберите свой предмет');
      if (typeof group !== 'string' || !group.trim() || group.length > 100) return bad(res, 400, 'Укажите группу');
      if (!teacherHasGroup(u, group)) return bad(res, 403, 'Эта группа не закреплена за вами. Её назначает администратор портала');
      const hm = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if (!hm.test(startTime) || !hm.test(endTime) || startTime >= endTime) return bad(res, 400, 'Укажите время (ЧЧ:ММ)');
      if (!Number.isInteger(Number(day)) || day < 0 || day > 6 || String(room).length > 100 || String(type).length > 80) return bad(res, 400, 'Некорректные данные');
      const e = {
        id: nid('sc'), subjectId, teacherId: u.id, type: String(type || 'Практ.'),
        group: String(group).trim(), day: Math.max(0, Math.min(6, Number(day))),
        start: String(startTime), end: String(endTime), room: String(room || '').trim(),
      };
      db.schedule.push(e);
      db.users.filter((x) => x.role === 'student' && x.group === e.group)
        .forEach((x) => pushInbox(x, { type: 'schedule', subject: sub.name, day: e.day, start: e.start, end: e.end, room: e.room, lessonType: e.type }));
      saveDB();
      return ok(res, { id: e.id });
    }
    return false;
  };
}

module.exports = { createStudy };
