'use strict';
/*
 * Справочник учебных групп: направления ИСУ и БТ, годы набора 2023–2026, по 3 группы в каждом наборе.
 * Название группы — «<направление><год набора>-<номер>», например ИСУ2025-2.
 *
 * Используется: регистрация студента (группа выбирается из списка, server.js /api/auth/register),
 * публичный список для формы регистрации (GET /api/groups), админ-панель (выбор групп преподавателя).
 * Группы, созданные до справочника (например, ИСУ-26-2-а), остаются у своих студентов и в закреплениях
 * преподавателей — справочник их не удаляет, админ-панель показывает их отдельно.
 * Новое направление или год набора — дописать сюда.
 */
const DIRECTIONS = ['ИСУ', 'БТ'];
const YEARS = [2023, 2024, 2025, 2026];
const GROUPS_PER_YEAR = 3;

const GROUP_CATALOG = DIRECTIONS.flatMap((dir) => YEARS.flatMap((year) =>
  Array.from({ length: GROUPS_PER_YEAR }, (_, i) => `${dir}${year}-${i + 1}`)));
const CATALOG_SET = new Set(GROUP_CATALOG);
const isCatalogGroup = (group) => CATALOG_SET.has(String(group || '').trim());

module.exports = { DIRECTIONS, YEARS, GROUPS_PER_YEAR, GROUP_CATALOG, isCatalogGroup };
