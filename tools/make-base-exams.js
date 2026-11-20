#!/usr/bin/env node
'use strict';
/*
 * Генератор базовых экзаменов: 4 предмета × 4 экзамена (уровень 1 курса) в формате редактора (exam-builder/1).
 *
 *   node tools/make-base-exams.js [covers.json]
 *
 * Пишет exam-sync/base-exams.json — сервер добавляет недостающие шаблоны при старте, не сбрасывая существующие экзамены и работы.
 * Каждая запись — объект D.tests (kind:'exam') и соответствующая бессрочная публикация D.rooms.
 * Обложка хранится в публикации (room.cover). Обложки (data URL, 560×315 WebP) берутся из covers.json ({ m1:{src,title,page,license,author}, … }),
 * а если файл не указан — из уже существующего base-exams.json.
 * Фото: Wikimedia Commons, свободные лицензии (автор и лицензия — в поле coverCredit каждой записи).
 */
const fs = require('fs');
const path = require('path');
const XM = require('../exam-sync/eb/model.js');

const OUT = path.join(__dirname, '..', 'exam-sync', 'base-exams.json');
const TEACHER_OF = { math: 't-aronov', kaz: 't-temirshol', eng: 't-vasilievna', bio: 't-kosgahmenova' };
const SUBJ_NAME = { math: 'Высшая математика', kaz: 'Казахский язык', eng: 'Английский язык', bio: 'Микробиология' };

// --- конструкторы заданий (поля как в eb/model.js → newTask) ---
const mc = (question, options, answer) => ({ type: 'mc', question, options, answer, points: 1 });
const multi = (question, options, answers) => ({ type: 'multi', question, options, answers, points: 1 });
const tf = (question, answer, variant = 'ru') => ({ type: 'tf', question, variant, answer, points: 1 }); // answer — индекс в TF_VARIANTS[variant]
const short = (question, answer) => ({ type: 'short', question, answer, points: 1 });
const gap = (question) => ({ type: 'gap', question, points: 1 });
const match = (question, left, right, answer) => ({ type: 'match', question, left, right, answer, points: left.length });
const info = (title, text) => ({ type: 'info', kind: 'text', title, text, points: 0 });

const RU_INS = 'Выберите или впишите правильный ответ. Каждое задание можно выполнить один раз; результат появится сразу после завершения.';
const KK_INS = 'Дұрыс жауапты таңдаңыз немесе жазыңыз. / Выберите или впишите правильный ответ.';
const EN_INS = 'Choose or type the correct answer. You can submit the test only once.';

const EXAMS = [
  /* ===== Высшая математика — Евгений Аронов ===== */
  { key: 'm1', subject: 'math', title: 'Пределы функций', ins: RU_INS, tasks: [
    mc('Найдите lim (3x + 1) при x → 2.', ['5', '6', '7', '8'], 2),
    mc('Первый замечательный предел: lim (sin x / x) при x → 0 равен…', ['0', '1', '∞', 'не существует'], 1),
    short('Найдите lim (2x² + 1)/(x² − 3) при x → ∞. Ответ — число.', '2'),
    tf('Предел lim (x² − 1)/(x − 1) при x → 1 равен 2.', 0),
    mc('Второй замечательный предел: lim (1 + 1/x)ˣ при x → ∞ равен…', ['1', 'e', '0', '∞'], 1),
    multi('Какие функции непрерывны на всей числовой прямой?', ['x²', '1/x', 'sin x', 'ln x', 'eˣ'], [0, 2, 4]),
    gap('lim (x² − 9)/(x − 3) при x → 3 = {{6}}'),
    match('Сопоставьте предел (x → 0, кроме отмеченного) и его значение.', ['(1 − cos x)/x²', '(eˣ − 1)/x', '1/x при x → ∞', 'tg x / x'], ['1/2', '1', '0'], [0, 1, 2, 1])
  ] },
  { key: 'm2', subject: 'math', title: 'Производная и её применение', ins: RU_INS, tasks: [
    mc('(x³)′ = …', ['3x²', 'x²', '3x', 'x⁴/4'], 0),
    mc('(sin x)′ = …', ['−cos x', 'cos x', '−sin x', 'tg x'], 1),
    short('Найдите f′(1), если f(x) = x² + 3x. Ответ — число.', '5'),
    tf('Производная постоянной функции равна нулю.', 0),
    mc('(eˣ)′ = …', ['eˣ', 'x·eˣ⁻¹', 'eˣ/x', 'ln x'], 0),
    gap('(ln x)′ = 1/{{x}}'),
    multi('Какие правила дифференцирования верны?', ['(uv)′ = u′v + uv′', '(u + v)′ = u′ + v′', '(u/v)′ = u′/v′', '(c·u)′ = c·u′'], [0, 1, 3]),
    match('Сопоставьте функцию и её производную.', ['x⁵', 'cos x', '√x', '1/x'], ['−sin x', '5x⁴', '−1/x²', '1/(2√x)'], [1, 0, 3, 2])
  ] },
  { key: 'm3', subject: 'math', title: 'Матрицы и определители', ins: RU_INS, tasks: [
    mc('Вычислите определитель матрицы (1 2; 3 4).', ['−2', '2', '10', '−10'], 0),
    short('Вычислите определитель матрицы (2 0; 0 5). Ответ — число.', '10'),
    tf('Умножение матриц всегда коммутативно: AB = BA.', 1),
    mc('Каков размер произведения AB, если A имеет размер 2×3, а B — 3×4?', ['2×4', '3×3', '4×2', 'произведение не определено'], 0),
    multi('Какие свойства определителя верны?', ['det(Aᵀ) = det A', 'det(AB) = det A · det B', 'det(A + B) = det A + det B', 'если в матрице есть нулевая строка, det A = 0'], [0, 1, 3]),
    gap('Ранг единичной матрицы размера 3×3 равен {{3}}.'),
    mc('Обратная матрица A⁻¹ существует, если…', ['det A ≠ 0', 'det A = 0', 'A — прямоугольная матрица', 'все элементы A положительны'], 0),
    match('Сопоставьте вид матрицы и её описание.', ['Единичная', 'Нулевая', 'Диагональная', 'Транспонированная'], ['все элементы равны 0', 'строки и столбцы исходной матрицы поменяны местами', 'единицы на главной диагонали, остальные элементы — 0', 'ненулевые элементы только на главной диагонали'], [2, 0, 3, 1])
  ] },
  { key: 'm4', subject: 'math', title: 'Интегралы: основы', ins: RU_INS, tasks: [
    mc('∫ x dx = …', ['x²/2 + C', 'x² + C', '1 + C', '2x + C'], 0),
    mc('∫ cos x dx = …', ['sin x + C', '−sin x + C', 'cos x + C', 'tg x + C'], 0),
    short('Вычислите ∫ 2x dx от 0 до 1. Ответ — число.', '1'),
    tf('∫ eˣ dx = eˣ + C', 0),
    mc('∫ dx/x = …', ['ln|x| + C', '1/x² + C', 'x + C', '−1/x + C'], 0),
    gap('∫ 3 dx от 0 до 2 = {{6}}'),
    multi('Какие свойства интеграла верны?', ['∫(f + g) = ∫f + ∫g', '∫c·f = c·∫f', '∫f·g = ∫f · ∫g', 'интеграл от a до a равен 0'], [0, 1, 3]),
    match('Сопоставьте функцию и её первообразную.', ['x²', 'sin x', 'eˣ', '1'], ['−cos x + C', 'x + C', 'x³/3 + C', 'eˣ + C'], [2, 0, 3, 1])
  ] },

  /* ===== Казахский язык — Гильмира Темиршол ===== */
  { key: 'k1', subject: 'kaz', title: 'Қазақ әліпбиі және дыбыстар', ins: KK_INS, tasks: [
    mc('Қазақ тіліне ғана тән (төл) дыбысты белгілейтін әріп қайсы?', ['ә', 'в', 'ф', 'ц'], 0),
    multi('Жуан дауысты дыбыстарды таңдаңыз.', ['а', 'ә', 'о', 'ұ', 'і', 'ы'], [0, 2, 3, 5]),
    tf('Кирилл негізіндегі қазақ әліпбиінде 42 әріп бар.', 0),
    short('«Кітап» сөзінде неше буын бар? Цифрмен жазыңыз.', '2'),
    match('Сөздерді аудармасымен сәйкестендіріңіз.', ['мектеп', 'кітап', 'дәптер', 'қалам'], ['книга', 'ручка', 'школа', 'тетрадь'], [2, 0, 3, 1]),
    gap('Үндестік заңы бойынша: бала + көптік жалғау = бала{{лар}}.'),
    mc('Ұяң дауыссыз дыбысты табыңыз.', ['п', 'б', 'к', 'т'], 1),
    tf('«Ү» әрпі жуан дауысты дыбысты білдіреді.', 1)
  ] },
  { key: 'k2', subject: 'kaz', title: 'Зат есім және септіктер', ins: KK_INS, tasks: [
    mc('Қазақ тілінде неше септік бар?', ['5', '6', '7', '8'], 2),
    mc('«Кімнің? Ненің?» сұрағына жауап беретін септік:', ['Атау', 'Ілік', 'Барыс', 'Табыс'], 1),
    gap('Мен университет{{ке}} барамын.'),
    gap('Ол кітап{{ты}} оқыды.'),
    match('Септікті оның сұрағымен сәйкестендіріңіз.', ['Атау', 'Жатыс', 'Шығыс', 'Көмектес'], ['Кімнен? Неден?', 'Кім? Не?', 'Кіммен? Немен?', 'Кімде? Неде?'], [1, 3, 0, 2]),
    short('«Үй» сөзін жатыс септігінде жазыңыз.', 'үйде'),
    multi('Көптік жалғауларын таңдаңыз.', ['-лар', '-дың', '-тер', '-ға', '-дар'], [0, 2, 4]),
    tf('«Қаладан» сөзі шығыс септігінде тұр.', 0)
  ] },
  { key: 'k3', subject: 'kaz', title: 'Етістік: шақтар', ins: KK_INS, tasks: [
    mc('Мен кеше кітап ___.', ['оқыдым', 'оқимын', 'оқитын', 'оқы'], 0),
    mc('Біз ертең Алматыға ___.', ['бардық', 'барамыз', 'барған', 'бару'], 1),
    gap('Ол қазір хат жазып {{отыр}}.'),
    tf('«Келді» етістігі өткен шақта тұр.', 0),
    short('«Бару» етістігінің түбірін жазыңыз.', 'бар'),
    match('Жіктеу есімдігін етістікпен сәйкестендіріңіз.', ['Мен', 'Сен', 'Біз', 'Олар'], ['барады', 'барамын', 'барасың', 'барамыз'], [1, 2, 3, 0]),
    multi('Өткен шақтағы етістіктерді таңдаңыз.', ['келді', 'барады', 'оқыды', 'жазамын', 'көрдім'], [0, 2, 4]),
    mc('Етістік қандай сұраққа жауап береді?', ['Кім? Не?', 'Не істеді? Не қылды?', 'Қандай?', 'Қанша?'], 1)
  ] },
  { key: 'k4', subject: 'kaz', title: 'Отбасы және университет: лексика', ins: KK_INS, tasks: [
    match('Туыстық атауларды аудармасымен сәйкестендіріңіз.', ['әке', 'ана', 'аға', 'әпке'], ['мама', 'старший брат', 'папа', 'старшая сестра'], [2, 0, 1, 3]),
    mc('«Расписание занятий» қазақша қалай болады?', ['сабақ кестесі', 'емтихан', 'дәріс', 'сынақ'], 0),
    tf('«Дәріс» сөзі орыс тіліне «лекция» деп аударылады.', 0),
    gap('Менің атым Айгерім. Мен бірінші {{курс}}та оқимын.'),
    short('«Семья» сөзін қазақ тіліне аударыңыз.', 'отбасы'),
    multi('Университетке қатысты сөздерді таңдаңыз.', ['аудитория', 'ата', 'емтихан', 'нан', 'дәріс'], [0, 2, 4]),
    tf('«Немере» сөзі «дедушка» дегенді білдіреді.', 1),
    mc('«Преподаватель» сөзінің қазақша баламасы:', ['оқытушы', 'оқушы', 'ата-ана', 'көрші'], 0)
  ] },

  /* ===== Английский язык — Елена Васильевна ===== */
  { key: 'e1', subject: 'eng', title: 'Present Tenses', ins: EN_INS, tasks: [
    mc('She ___ coffee every morning.', ['drink', 'drinks', 'is drinking', 'drunk'], 1),
    mc('Look! It ___.', ['rains', 'is raining', 'rained', 'has rained'], 1),
    gap('I {{have lived|\'ve lived}} (live) here since 2020.'),
    tf('We use the Present Continuous for permanent situations.', 1, 'tf'),
    short('Write the third-person singular form of the verb "study".', 'studies'),
    multi('Which verbs are NOT usually used in continuous tenses?', ['know', 'run', 'believe', 'play', 'want'], [0, 2, 4]),
    mc('How long ___ English?', ['do you learn', 'have you been learning', 'are you learning', 'you learn'], 1),
    match('Match each sentence with its tense.', ['He works in a bank.', 'He is working now.', 'He has worked here for years.', 'He has been working since 9 am.'], ['Present Perfect', 'Present Continuous', 'Present Perfect Continuous', 'Present Simple'], [3, 1, 0, 2])
  ] },
  { key: 'e2', subject: 'eng', title: 'Past Simple vs Present Perfect', ins: EN_INS, tasks: [
    mc('I ___ him yesterday.', ['have seen', 'saw', 'see', 'had see'], 1),
    mc('She ___ already ___ her homework.', ['has … finished', 'did … finish', 'is … finishing', 'was … finished'], 0),
    gap('They {{went}} (go) to London last summer.'),
    tf('We use the Present Perfect with "ago".', 1, 'tf'),
    short('Write the Past Simple form of "buy".', 'bought'),
    multi('Choose the time expressions typical of the Present Perfect.', ['ever', 'yesterday', 'already', 'last week', 'just'], [0, 2, 4]),
    mc('___ you ever ___ to Paris?', ['Have … been', 'Did … go', 'Were … be', 'Do … go'], 0),
    match('Match the verb with its past participle.', ['write', 'go', 'take', 'eat'], ['taken', 'eaten', 'written', 'gone'], [2, 3, 0, 1])
  ] },
  { key: 'e3', subject: 'eng', title: 'Academic Vocabulary', ins: EN_INS, tasks: [
    match('Match the words with their translations.', ['analyse', 'significant', 'evidence', 'approach'], ['доказательство', 'значительный', 'подход', 'анализировать'], [3, 1, 0, 2]),
    mc('"However" is closest in meaning to…', ['therefore', 'but', 'because', 'also'], 1),
    mc('The research ___ that sleep improves memory.', ['suggests', 'suggestion', 'suggestive', 'suggestively'], 0),
    tf('"Furthermore" is used to add information.', 0, 'tf'),
    gap('The results were {{consistent}} (соответствующие, c…) with previous studies.'),
    short('Write the noun form of the verb "conclude".', 'conclusion'),
    multi('Which linking words express contrast?', ['although', 'moreover', 'whereas', 'therefore', 'nevertheless'], [0, 2, 4]),
    mc('Choose the synonym of "obtain".', ['get', 'give', 'lose', 'show'], 0)
  ] },
  { key: 'e4', subject: 'eng', title: 'Reading: University Life', ins: 'Read the text and answer the questions.', section: 'reading', tasks: [
    info('My First Year at University', 'When Aliya started university, everything felt new. She moved from a small town to Almaty and shared a room in the dormitory with two other students. At first she found the lectures difficult because the professors spoke quickly and used many academic words.\n\nIn October Aliya joined a study group. Four students met in the library every Wednesday to compare their notes and prepare for seminars. This helped her a lot: by December her marks had improved, and she felt more confident when she spoke in class.\n\nAliya also learned to plan her time. She used a paper diary for deadlines and did not leave her essays until the last night. Her advice to new students is simple: ask questions, find people to study with and get enough sleep before exams.'),
    tf('Aliya grew up in Almaty.', 1, 'tfng'),
    tf('Aliya lived with two roommates.', 0, 'tfng'),
    tf('Aliya\'s study group met in a café.', 1, 'tfng'),
    tf('Aliya got the highest mark in her group.', 2, 'tfng'),
    mc('Why were the lectures difficult for Aliya at first?', ['They started too early.', 'The professors spoke fast and used academic words.', 'They were in Kazakh.', 'She missed many of them.'], 1),
    mc('What did Aliya use to plan her deadlines?', ['a mobile app', 'a paper diary', 'a wall calendar', 'her friend\'s notes'], 1),
    short('On which day of the week did the study group meet?', 'Wednesday|on Wednesday|on Wednesdays|Wednesdays'),
    gap('Aliya\'s advice: ask questions, find people to study with and get enough {{sleep}} before exams.')
  ] },

  /* ===== Микробиология — Даяна Косгахменова ===== */
  { key: 'b1', subject: 'bio', title: 'Строение бактериальной клетки', ins: RU_INS, tasks: [
    mc('Где находится генетический материал бактерий?', ['в ядре', 'в нуклеоиде', 'в митохондриях', 'в аппарате Гольджи'], 1),
    multi('Какие структуры есть у бактериальной клетки?', ['клеточная стенка', 'ядро с ядерной оболочкой', 'рибосомы 70S', 'митохондрии', 'плазмиды'], [0, 2, 4]),
    tf('Бактерии относятся к прокариотам.', 0),
    mc('Основной компонент клеточной стенки бактерий:', ['пептидогликан (муреин)', 'целлюлоза', 'хитин', 'крахмал'], 0),
    short('Как называются органоиды движения бактерий? (одно слово во мн. ч.)', 'жгутики'),
    gap('Рибосомы бактерий имеют константу седиментации {{70S|70}}.'),
    match('Сопоставьте форму бактерий и их название.', ['шаровидные', 'палочковидные (спорообразующие)', 'спирально извитые', 'изогнутые в виде запятой'], ['вибрионы', 'кокки', 'спириллы', 'бациллы'], [1, 3, 2, 0]),
    tf('Споры бактерий служат для размножения.', 1)
  ] },
  { key: 'b2', subject: 'bio', title: 'Вирусы и бактериофаги', ins: RU_INS, tasks: [
    mc('Вирусы — это…', ['неклеточные формы жизни', 'прокариоты', 'эукариоты', 'простейшие'], 0),
    mc('Белковая оболочка вируса называется…', ['капсид', 'капсула', 'клеточная стенка', 'цитоплазматическая мембрана'], 0),
    tf('Вирусы могут размножаться вне клетки-хозяина.', 1),
    multi('Какие заболевания вызываются вирусами?', ['грипп', 'туберкулёз', 'корь', 'холера', 'ВИЧ-инфекция'], [0, 2, 4]),
    short('Как называются вирусы, поражающие бактерии?', 'бактериофаги|бактериофаг|фаги'),
    gap('Генетический материал вируса представлен ДНК или {{РНК}}.'),
    mc('Антибиотики против вирусов…', ['эффективны всегда', 'не эффективны', 'эффективны только против ДНК-вирусов', 'эффективны в высокой дозе'], 1),
    match('Сопоставьте стадию взаимодействия вируса с клеткой и её суть.', ['Адсорбция', 'Проникновение', 'Синтез компонентов', 'Выход'], ['выход новых вирионов из клетки', 'прикрепление к рецепторам клетки', 'попадание вируса или его генома в клетку', 'репликация генома и синтез вирусных белков'], [1, 2, 3, 0])
  ] },
  { key: 'b3', subject: 'bio', title: 'Методы окраски и микроскопия', ins: RU_INS, tasks: [
    mc('Грамположительные бактерии при окраске по Граму окрашиваются в…', ['фиолетовый цвет', 'красный (розовый) цвет', 'зелёный цвет', 'жёлтый цвет'], 0),
    mc('Грамотрицательные бактерии при окраске по Граму окрашиваются в…', ['фиолетовый цвет', 'красный (розовый) цвет', 'зелёный цвет', 'жёлтый цвет'], 1),
    tf('Окраска по Цилю–Нильсену применяется для выявления кислотоустойчивых бактерий.', 0),
    short('Какой раствор используют после генцианового фиолетового при окраске по Граму? (раствор …)', 'Люголя|раствор Люголя|люголя'),
    multi('Какие этапы входят в окраску по Граму?', ['окраска генциановым фиолетовым', 'обработка раствором Люголя', 'обесцвечивание спиртом', 'окраска суданом III', 'докраска фуксином'], [0, 1, 2, 4]),
    gap('Иммерсионный объектив микроскопа используют с иммерсионным {{маслом}}.'),
    mc('Микобактерии туберкулёза при окраске по Цилю–Нильсену окрашиваются в…', ['красный цвет', 'синий цвет', 'зелёный цвет', 'фиолетовый цвет'], 0),
    match('Сопоставьте метод окраски и его назначение.', ['по Граму', 'по Цилю–Нильсену', 'по Ожешко', 'по Бурри–Гинсу'], ['выявление спор', 'выявление капсул', 'дифференциация по строению клеточной стенки', 'выявление кислотоустойчивых бактерий'], [2, 3, 0, 1])
  ] },
  { key: 'b4', subject: 'bio', title: 'Питательные среды и стерилизация', ins: RU_INS, tasks: [
    mc('Какая среда относится к основным (универсальным)?', ['мясо-пептонный агар (МПА)', 'среда Эндо', 'среда Левина', 'среда Плоскирева'], 0),
    tf('Агар-агар служит источником питания для бактерий.', 1),
    mc('Автоклавирование обычно проводят паром под давлением при температуре около…', ['121 °C', '60 °C', '80 °C', '200 °C'], 0),
    multi('Какие методы являются методами стерилизации?', ['автоклавирование', 'сухой жар', 'пастеризация', 'фильтрование через мембранные фильтры', 'мытьё проточной водой'], [0, 1, 3]),
    short('Как называется видимое скопление бактерий на плотной среде, выросшее из одной клетки?', 'колония'),
    gap('Чашка {{Петри}} используется для выращивания микроорганизмов на плотных средах.'),
    mc('Среда Эндо относится к средам…', ['дифференциально-диагностическим', 'основным (простым)', 'транспортным', 'обогащения'], 0),
    match('Сопоставьте среду и её назначение.', ['МПБ', 'МПА', 'Кровяной агар', 'Среда Сабуро'], ['культивирование грибов', 'жидкая основная среда', 'плотная основная среда', 'выявление гемолиза'], [1, 2, 3, 0])
  ] }
];

function buildExam(def, idx) {
  const e = XM.newExam();
  e.id = 'exam_base_' + def.key;
  e.title = def.title;
  e.subtitle = SUBJ_NAME[def.subject] + ' · 1 курс';
  e.instructions = def.ins;
  e.settings.timeLimit = 20;
  const sec = def.section || 'test';
  e.sections[sec].tasks = def.tasks.map((t, i) => Object.assign({ id: `t_base_${def.key}_${i + 1}`, media: [] }, t));
  const n = XM.normalize(e);
  // проверка: всё распознаётся моделью и у каждого оцениваемого задания есть ключ
  n.sections[sec].tasks.forEach((t, i) => {
    if (t.type === 'info') return;
    const g = XM.grade(t, undefined);
    if (!g || g.ungraded) throw new Error(`${def.key}: задание ${i + 1} без ключа`);
  });
  if (n.sections[sec].tasks.length !== def.tasks.length) throw new Error(def.key + ': задания потеряны при normalize');
  return n;
}

const coversFile = process.argv[2];
let covers = {};
if (coversFile) covers = JSON.parse(fs.readFileSync(coversFile, 'utf8'));
else if (fs.existsSync(OUT)) { const old = JSON.parse(fs.readFileSync(OUT, 'utf8')); old.tests.forEach((t) => { const r = old.rooms.find((x) => x.test.testIds.includes(t.id)); covers[t.baseKey] = { src: r ? r.cover : '', credit: t.coverCredit }; }); }

const NOW = Date.UTC(2026, 10, 19, 6, 0, 0);
const tests = [], rooms = [];
EXAMS.forEach((def, i) => {
  const exam = buildExam(def, i);
  const c = covers[def.key] || {};
  const credit = c.credit || (c.title ? { title: c.title, page: c.page, license: c.license, author: c.author } : null);
  const rec = {
    id: 'bx-' + def.key, baseKey: def.key, kind: 'exam', title: exam.title, description: exam.subtitle,
    timeLimit: exam.settings.timeLimit, passPercent: 60, shuffle: false, showAnswers: true, questions: [], exam,
    ownerId: TEACHER_OF[def.subject], subject: def.subject, coverCredit: credit, updatedAt: NOW
  };
  tests.push(rec);
  const sec = def.section || 'test';
  const room = {
    id: 'br-' + def.key, title: exam.title, description: exam.instructions, courses: [], subgroups: [], examStart: '',
    durMode: 'none', durMinutes: 90, durDays: 1, startAt: null, endAt: null, createdAt: NOW + i,
    test: { on: true, testIds: [rec.id], max: sec === 'test' ? 100 : 20 },
    reading: { max: sec === 'reading' ? 100 : 20 }, listening: { max: 20 },
    writing: { on: false, prompt: '', minWords: 120, max: 20, minutes: 0 },
    speaking: { on: false, prompt: '', minutes: 5, max: 20, order: 'any' },
    ownerId: rec.ownerId, subject: def.subject, cover: c.src || ''
  };
  rooms.push(room);
});
const missing = rooms.filter((r) => !r.cover).map((r) => r.id);
fs.writeFileSync(OUT, JSON.stringify({ version: 1, tests, rooms }) + '\n');
console.log(`base-exams.json: ${tests.length} экзаменов, ${rooms.length} публикаций` + (missing.length ? `; без обложки: ${missing.join(', ')}` : ''));
